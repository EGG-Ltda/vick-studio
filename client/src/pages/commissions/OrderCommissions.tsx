import { useEffect, useState } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { bookingRequest, money, bookingDate } from '../booking/bookingApi'
export function OrderCommissions({
  id,
  revision,
  onBusyChange,
  onChanged,
}: {
  id: number
  revision: string
  onBusyChange: (busy: boolean) => void
  onChanged: () => void
}) {
  const [data, setData] = useState<{
      items: {
        id: number
        employeeName: string
        name: string
        grossAmount: number
        percent: number
        amount: number
        reversed: number
        closingId: number | null
        pendingAdjustment: number
      }[]
      canAnnul: boolean
      annulledAt: string | null
    } | null>(null),
    [reason, setReason] = useState(''),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<NonNullable<typeof data>>(`/commissions/orders/${id}`, {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [id, revision])
  async function annul() {
    setBusy(true)
    onBusyChange(true)
    setError('')
    try {
      await bookingRequest(`/commissions/orders/${id}/annul`, {
        method: 'POST',
        body: JSON.stringify({ reason, acknowledgeLinkedImpact: ack }),
      })
      setData(await bookingRequest(`/commissions/orders/${id}`))
      setConfirm(false)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to annul appointment.')
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <section className="order-section">
      <h3>Comissões do atendimento</h3>
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando comissões…</p>}
      {data && !data.items.length && (
        <p>
          Nenhuma comissão registrada. O reconhecimento ocorre somente na
          conclusão; atendimentos concluídos antes deste recurso não recebem
          cálculo retroativo.
        </p>
      )}
      {data?.items.map((c) => (
        <article className="order-line" key={c.id}>
          <strong>
            {c.employeeName} · {c.name}
          </strong>
          <small>
            Base bruta {money(c.grossAmount)} × {c.percent}% = {money(c.amount)}
          </small>
          <small>
            Ajustes: − {money(c.reversed)} · Líquido:{' '}
            {money(c.amount - c.reversed)}
          </small>
          <small>
            {c.closingId
              ? `Crédito no fechamento #${c.closingId}`
              : 'Crédito pendente de fechamento'}
            {c.closingId && c.pendingAdjustment > 0
              ? ` · ${money(c.pendingAdjustment)} a compensar no próximo fechamento`
              : ''}
          </small>
        </article>
      ))}
      {data?.annulledAt && (
        <p>
          Atendimento anulado em {bookingDate(data.annulledAt)}. O lançamento
          original foi preservado.
        </p>
      )}
      {data?.canAnnul && (
        <form
          className="booking-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (confirm) void annul()
            else setConfirm(true)
          }}
        >
          <fieldset disabled={busy}>
            <legend>Anular atendimento concluído</legend>
            <p>
              A anulação estorna a comissão restante. Não devolve dinheiro ao
              cliente, não cancela outros atendimentos e não disponibiliza
              automaticamente uma nova utilização do pacote.
            </p>
            <label>
              Motivo
              <SalonInput
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setConfirm(false)
                }}
              />
            </label>
            <label className="booking-choice">
              <SalonInput
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Conferi o impacto nos atendimentos vinculados e nas utilizações do
              pacote.
            </label>
            {confirm && (
              <p className="booking-alert">
                Confirmar a anulação? O histórico financeiro e os ajustes serão
                mantidos.
              </p>
            )}
            <button>
              {busy
                ? 'Anulando…'
                : confirm
                  ? 'Confirmar anulação'
                  : 'Revisar anulação'}
            </button>
            {confirm && (
              <button type="button" onClick={() => setConfirm(false)}>
                Voltar
              </button>
            )}
          </fieldset>
        </form>
      )}
    </section>
  )
}
