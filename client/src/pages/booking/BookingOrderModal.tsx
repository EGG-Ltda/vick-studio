import { useEffect, useState } from 'react'
import { OrderChanges } from '../social/OrderChanges'
import { PackagePayments } from '../social/PackagePayments'
import { SalonModal } from '../../components/SalonModal'
import {
  bookingDate,
  bookingRequest,
  bookingStatus,
  cancellationText,
  money,
} from './bookingApi'
import type { BookingOrder } from './bookingApi'
import { OrderManagement } from './OrderManagement'
export function BookingOrderModal({
  id,
  onClose,
  onChanged,
}: {
  id: number
  onClose: () => void
  onChanged: () => void
}) {
  const [order, setOrder] = useState<BookingOrder | null>(null),
    [amount, setAmount] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ledgerRevision, setLedgerRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    bookingRequest<BookingOrder>(`/booking/orders/${id}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setOrder(data)
          setAmount(String(data.depositRequired ?? ''))
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [id])
  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await bookingRequest(`/booking/orders/${id}/deposit`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) }),
      })
      setOrder(await bookingRequest<BookingOrder>(`/booking/orders/${id}`))
      onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to confirm deposit.',
      )
      onChanged()
      setOrder(
        await bookingRequest<BookingOrder>(`/booking/orders/${id}`).catch(
          () => null,
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      title={`Comanda #${id}`}
      description="Detalhes da reserva e confirmação do sinal."
      busy={busy}
      onClose={onClose}
    >
      <div className="booking-order">
        {error && (
          <p role="alert" className="booking-error">
            {error}
          </p>
        )}
        {!order && !error && <p role="status">Carregando comanda…</p>}
        {order && (
          <>
            <span className={`booking-status ${order.status}`}>
              {bookingStatus(order.status)}
            </span>
            <h2>{order.customerName}</h2>
            <p>
              {order.employeeName} ·{' '}
              {order.treatments?.map((t) => t.name).join(' + ')}
            </p>
            <p>
              {bookingDate(order.startsAt)} — {bookingDate(order.endsAt)}{' '}
              (Brasília)
            </p>
            <dl>
              <dt>Valor combinado</dt>
              <dd>{money(order.totalPrice)}</dd>
              <dt>Sinal necessário</dt>
              <dd>
                {order.depositRequired == null
                  ? 'Não exigido nesta reserva'
                  : money(order.depositRequired)}
              </dd>
              <dt>Sinal</dt>
              <dd>
                {order.depositRequired == null
                  ? 'Não se aplica'
                  : order.depositConfirmedAt
                    ? 'Confirmado'
                    : 'Pendente'}
              </dd>
              {order.depositDueAt && (
                <>
                  <dt>Prazo do sinal</dt>
                  <dd>{bookingDate(order.depositDueAt)} (Brasília)</dd>
                </>
              )}
              {order.depositConfirmedAt && (
                <>
                  <dt>Valor recebido</dt>
                  <dd>{money(order.depositReceived)}</dd>
                  <dt>Confirmado por</dt>
                  <dd>
                    {order.depositConfirmedBy} em{' '}
                    {bookingDate(order.depositConfirmedAt)}
                  </dd>
                </>
              )}
            </dl>
            {order.cancelledAt && (
              <div className="booking-alert">
                <strong>Cancelado em {bookingDate(order.cancelledAt)}</strong>
                <p>{cancellationText(order.cancellationReason)}</p>
              </div>
            )}
            {order.status === 'awaiting_deposit' && order.canConfirmDeposit && (
              <form
                className="booking-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                <label>
                  Valor do sinal recebido (R$)
                  <input
                    required
                    type="number"
                    min={order.depositRequired}
                    max={order.totalPrice}
                    step="0.01"
                    disabled={busy}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <p className="booking-note">
                  Confirme somente após verificar o recebimento. Essa ação
                  registra seu usuário e a data da baixa.
                </p>
                <button className="primary-button" disabled={busy}>
                  {busy ? 'Confirmando…' : 'Confirmar recebimento do sinal'}
                </button>
              </form>
            )}
            {order.status === 'awaiting_deposit' &&
              !order.canConfirmDeposit && (
                <p>
                  Apenas a profissional responsável, ADMIN ou MASTER pode
                  confirmar o sinal.
                </p>
              )}
            {order.packagePurchaseId && (
              <PackagePayments
                id={order.packagePurchaseId}
                onBusyChange={setBusy}
                onChanged={() => {
                  setLedgerRevision((r) => r + 1)
                  onChanged()
                }}
              />
            )}
            <OrderChanges
              order={order}
              onBusyChange={setBusy}
              onChanged={() => {
                setLedgerRevision((r) => r + 1)
                void bookingRequest<BookingOrder>(`/booking/orders/${id}`)
                  .then(setOrder)
                  .catch((cause) => setError(cause.message))
                onChanged()
              }}
            />
            <OrderManagement
              key={`${id}-${order.status}-${ledgerRevision}`}
              id={id}
              onBusyChange={setBusy}
              onUpdated={() => {
                void bookingRequest<BookingOrder>(`/booking/orders/${id}`)
                  .then(setOrder)
                  .catch((cause) => setError(cause.message))
                onChanged()
              }}
            />
          </>
        )}
      </div>
    </SalonModal>
  )
}
