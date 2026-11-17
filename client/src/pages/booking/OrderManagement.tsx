import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { bookingDate, bookingRequest, money } from './bookingApi'
import '../dashboard/customers.css'
type OrderLedger = {
  extras: {
    id: number
    description: string
    quantity: number
    unitPrice: number
    total: number
    voidedAt: string | null
    voidReason: string | null
    author: string
    createdAt: string
  }[]
  notes: { id: number; body: string; author: string; createdAt: string }[]
  payments: {
    id: number
    kind: string
    amount: number
    description: string
    method: string
    author: string | null
    createdAt: string
    refundedAmount: number
  }[]
  methods: { id: number; name: string }[]
  treatmentTotal: number
  extrasTotal: number
  grandTotal: number
  totalPaid: number
  balance: number
  completedAt: string | null
  canManage: boolean
  canAddConsumption: boolean
  status: string
  canComplete: boolean
  canRefund: boolean
}
export function OrderManagement({
  id,
  onUpdated,
  onBusyChange,
}: {
  id: number
  onUpdated: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [data, setData] = useState<OrderLedger | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [extra, setExtra] = useState({
      description: '',
      quantity: '1',
      unitPrice: '',
    }),
    [payment, setPayment] = useState({
      amount: '',
      methodId: '',
      description: 'Pagamento do atendimento',
    }),
    [note, setNote] = useState(''),
    [refund, setRefund] = useState({ paymentId: '', amount: '', reason: '' }),
    [voiding, setVoiding] = useState<number | null>(null),
    [voidReason, setVoidReason] = useState(''),
    [completeReview, setCompleteReview] = useState(false)
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    bookingRequest<OrderLedger>(`/orders/${id}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [id])
  const withKey = (body: object) => {
    const text = JSON.stringify(body)
    if (request.current?.body !== text)
      request.current = { body: text, key: crypto.randomUUID() }
    return { ...body, requestKey: request.current.key }
  }
  async function mutate(
    path: string,
    body: object,
    success: string,
    clear: () => void,
  ) {
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      await bookingRequest(`/orders/${id}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      clear()
      request.current = null
      setNotice(success)
      setData(await bookingRequest<OrderLedger>(`/orders/${id}`))
      onUpdated()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to update order.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  function consumption(event: FormEvent) {
    event.preventDefault()
    void mutate(
      '/consumptions',
      withKey({
        description: extra.description,
        quantity: Number(extra.quantity),
        unitPrice: Number(extra.unitPrice),
      }),
      'Consumo adicionado à comanda.',
      () => setExtra({ description: '', quantity: '1', unitPrice: '' }),
    )
  }
  function receipt(event: FormEvent) {
    event.preventDefault()
    void mutate(
      '/payments',
      withKey({
        amount: Number(payment.amount),
        methodId: Number(payment.methodId),
        description: payment.description,
      }),
      'Recebimento registrado.',
      () =>
        setPayment({
          amount: '',
          methodId: '',
          description: 'Pagamento do atendimento',
        }),
    )
  }
  function reimbursement(event: FormEvent) {
    event.preventDefault()
    void mutate(
      `/payments/${refund.paymentId}/refund`,
      withKey({ amount: Number(refund.amount), reason: refund.reason }),
      'Estorno registrado.',
      () => setRefund({ paymentId: '', amount: '', reason: '' }),
    )
  }
  const refundable =
    data?.payments.filter(
      (item) => item.kind !== 'refund' && item.amount > item.refundedAmount,
    ) ?? []
  const selectedRefund = refundable.find(
    (item) => item.id === Number(refund.paymentId),
  )
  return (
    <section className="order-section">
      <h3>Consumos e valores da comanda</h3>
      {!data && !error && (
        <p role="status">Carregando consumos e recebimentos…</p>
      )}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="order-success">
          {notice}
        </p>
      )}
      {data && (
        <>
          <div className="order-money-summary">
            <span>Procedimentos combinados</span>
            <strong>{money(data.treatmentTotal)}</strong>
            <span>Consumos adicionais</span>
            <strong>{money(data.extrasTotal)}</strong>
            <span>Total da comanda</span>
            <strong>{money(data.grandTotal)}</strong>
            <span>Efetivamente pago</span>
            <strong>{money(data.totalPaid)}</strong>
            <span>
              {data.balance < 0 ? 'Crédito a devolver' : 'Saldo a receber'}
            </span>
            <strong>{money(Math.abs(data.balance))}</strong>
          </div>
          <h3>Itens consumidos</h3>
          {data.extras.length === 0 && (
            <p>Nenhum consumo adicional registrado.</p>
          )}
          {data.extras.map((item) => (
            <article
              key={item.id}
              className={`order-line${item.voidedAt ? ' voided' : ''}`}
            >
              <strong>
                {item.quantity} × {item.description} · {money(item.total)}
              </strong>
              <small>
                Unitário: {money(item.unitPrice)} · {item.author} ·{' '}
                {bookingDate(item.createdAt)}
              </small>
              {item.voidedAt ? (
                <small>Cancelado: {item.voidReason}</small>
              ) : (
                data.canAddConsumption && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setVoiding(item.id)
                      setVoidReason('')
                    }}
                  >
                    Cancelar item
                  </button>
                )
              )}
            </article>
          ))}
          {voiding !== null && (
            <form
              className="booking-form"
              onSubmit={(event) => {
                event.preventDefault()
                void mutate(
                  `/consumptions/${voiding}/void`,
                  { reason: voidReason },
                  'Item cancelado, mantendo o registro no histórico.',
                  () => setVoiding(null),
                )
              }}
            >
              <label>
                Motivo do cancelamento do item
                <input
                  required
                  minLength={3}
                  maxLength={1000}
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button disabled={busy} type="submit">
                Confirmar cancelamento do item
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => setVoiding(null)}
              >
                Voltar
              </button>
            </form>
          )}
          {!data.canAddConsumption && (
            <p className="booking-note">
              Esta comanda está{' '}
              {data.status === 'completed' ? 'concluída' : 'cancelada'} e não
              aceita novos consumos. Os itens já registrados permanecem no
              histórico.
            </p>
          )}
          {data.canAddConsumption && (
            <form className="booking-form" onSubmit={consumption}>
              <fieldset disabled={busy}>
                <legend>Adicionar consumo</legend>
                <label>
                  Descrição
                  <input
                    required
                    maxLength={255}
                    placeholder="Ex.: chocolate, café, produto"
                    value={extra.description}
                    onChange={(event) =>
                      setExtra({ ...extra, description: event.target.value })
                    }
                  />
                </label>
                <label>
                  Quantidade
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={extra.quantity}
                    onChange={(event) =>
                      setExtra({ ...extra, quantity: event.target.value })
                    }
                  />
                </label>
                <label>
                  Valor unitário (R$)
                  <input
                    required
                    type="number"
                    min="0"
                    max="99999.99"
                    step="0.01"
                    value={extra.unitPrice}
                    onChange={(event) =>
                      setExtra({ ...extra, unitPrice: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <button className="primary-button" disabled={busy}>
                Adicionar à comanda
              </button>
            </form>
          )}
          <section className="order-section">
            <h3>Recebimentos e estornos</h3>
            {data.status === 'awaiting_deposit' && (
              <p className="booking-alert">
                Esta reserva aguarda sinal. Para registrar o recebimento, use{' '}
                <strong>Confirmar recebimento do sinal</strong> no início desta
                comanda. Depois da confirmação, o formulário de recebimentos
                adicionais será liberado aqui.
              </p>
            )}
            <p className="booking-note">
              Registre valores efetivamente recebidos ou devolvidos. Esses
              lançamentos são manuais e não movimentam dinheiro.
            </p>
            {!data.payments.length && <p>Nenhum recebimento registrado.</p>}
            {data.payments.map((item) => (
              <article className="order-line" key={item.id}>
                <strong>
                  #{item.id} ·{' '}
                  {item.kind === 'refund'
                    ? 'Estorno'
                    : item.kind === 'deposit'
                      ? 'Sinal'
                      : 'Recebimento'}{' '}
                  · {money(item.amount)}
                </strong>
                <span>
                  {item.method} · {bookingDate(item.createdAt)}
                </span>
                <span>{item.description}</span>
                <small>
                  {item.author ?? 'Registro anterior'}
                  {item.refundedAmount > 0
                    ? ` · Estornado: ${money(item.refundedAmount)}`
                    : ''}
                </small>
              </article>
            ))}
            {data.balance > 0 && (data.canManage || data.completedAt) && (
              <form className="booking-form" onSubmit={receipt}>
                <fieldset disabled={busy}>
                  <legend>Registrar recebimento</legend>
                  <label>
                    Valor recebido (R$)
                    <input
                      required
                      type="number"
                      min="0.01"
                      max={data.balance}
                      step="0.01"
                      value={payment.amount}
                      onChange={(event) =>
                        setPayment({ ...payment, amount: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <select
                      required
                      value={payment.methodId}
                      onChange={(event) =>
                        setPayment({ ...payment, methodId: event.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      {data.methods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descrição
                    <input
                      required
                      maxLength={1023}
                      value={payment.description}
                      onChange={(event) =>
                        setPayment({
                          ...payment,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                </fieldset>
                <button className="primary-button" disabled={busy}>
                  Registrar valor recebido
                </button>
              </form>
            )}
            {data.canRefund && refundable.length > 0 && (
              <form className="booking-form" onSubmit={reimbursement}>
                <fieldset disabled={busy}>
                  <legend>Registrar estorno</legend>
                  <label>
                    Recebimento original
                    <select
                      required
                      value={refund.paymentId}
                      onChange={(event) =>
                        setRefund({
                          ...refund,
                          paymentId: event.target.value,
                          amount: '',
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {refundable.map((item) => (
                        <option value={item.id} key={item.id}>
                          #{item.id} · disponível{' '}
                          {money(item.amount - item.refundedAmount)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Valor devolvido (R$)
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={
                        selectedRefund
                          ? selectedRefund.amount -
                            selectedRefund.refundedAmount
                          : undefined
                      }
                      value={refund.amount}
                      onChange={(event) =>
                        setRefund({ ...refund, amount: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Motivo
                    <input
                      required
                      minLength={3}
                      maxLength={1000}
                      value={refund.reason}
                      onChange={(event) =>
                        setRefund({ ...refund, reason: event.target.value })
                      }
                    />
                  </label>
                </fieldset>
                <button disabled={busy}>Registrar valor estornado</button>
              </form>
            )}
          </section>
          <section className="order-section">
            <h3>Observações do atendimento</h3>
            <p className="booking-note">
              Visíveis apenas para a equipe autorizada nesta comanda.
            </p>
            {data.notes.map((item) => (
              <article className="customer-note" key={item.id}>
                <p>{item.body}</p>
                <small>
                  {item.author} · {bookingDate(item.createdAt)}
                </small>
              </article>
            ))}
            <form
              className="booking-form"
              onSubmit={(event) => {
                event.preventDefault()
                void mutate(
                  '/notes',
                  { body: note },
                  'Observação registrada.',
                  () => setNote(''),
                )
              }}
            >
              <label>
                Especificações ou observação interna
                <textarea
                  required
                  maxLength={4000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button disabled={busy || !note.trim()}>
                Adicionar observação
              </button>
            </form>
          </section>
          <section className="order-section">
            {!data.completedAt && data.canManage && !data.canComplete && (
              <p className="booking-note">
                A conclusão ficará disponível a partir do horário marcado para o
                atendimento.
              </p>
            )}
            {data.completedAt ? (
              <p className="order-success">
                Atendimento concluído em {bookingDate(data.completedAt)}.
              </p>
            ) : (
              data.canComplete && (
                <>
                  {completeReview ? (
                    <div className="booking-alert">
                      <p>
                        Confirmar que os procedimentos foram realizados? Eles
                        passarão a constar no histórico do cliente.{' '}
                        {data.balance > 0
                          ? `Ainda há ${money(data.balance)} a receber.`
                          : ''}
                      </p>
                      <button
                        disabled={busy}
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          void mutate(
                            '/complete',
                            {},
                            'Atendimento concluído.',
                            () => setCompleteReview(false),
                          )
                        }
                      >
                        Confirmar conclusão
                      </button>
                      <button
                        disabled={busy}
                        type="button"
                        onClick={() => setCompleteReview(false)}
                      >
                        Voltar
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      type="button"
                      className="primary-button"
                      onClick={() => setCompleteReview(true)}
                    >
                      Concluir atendimento
                    </button>
                  )}
                </>
              )
            )}
          </section>
        </>
      )}
    </section>
  )
}
