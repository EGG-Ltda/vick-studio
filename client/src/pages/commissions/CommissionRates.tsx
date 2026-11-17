import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { bookingDate, bookingRequest } from '../booking/bookingApi'
import './commissions.css'
type Rate = {
  treatmentId: number
  name: string
  standardPercent: number | null
  packagePercent: number | null
}
type Configuration = {
  employee: { name: string; version: number }
  canManage: boolean
  items: Rate[]
  audit: {
    id: number
    author: string
    createdAt: string
    previous: Rate[]
    current: Rate[]
  }[]
}
export function CommissionRates({
  id,
  onBusyChange = () => {},
  onSaved = () => {},
}: {
  id: number
  onBusyChange?: (busy: boolean) => void
  onSaved?: () => void
}) {
  const [data, setData] = useState<Configuration | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    setData(null)
    setError('')
    bookingRequest<Configuration>(`/commissions/employees/${id}`, {
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
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      await bookingRequest(`/commissions/employees/${id}/rates`, {
        method: 'PUT',
        body: JSON.stringify({
          version: data.employee.version,
          rates: data.items.map(
            ({ treatmentId, standardPercent, packagePercent }) => ({
              treatmentId,
              standardPercent,
              packagePercent,
            }),
          ),
        }),
      })
      setNotice(
        'Porcentagens salvas. O histórico dos atendimentos concluídos foi preservado.',
      )
      setRevision((n) => n + 1)
      onSaved()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to save commission rates.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  function update(
    index: number,
    key: 'standardPercent' | 'packagePercent',
    value: string,
  ) {
    setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((r, i) =>
              i === index
                ? { ...r, [key]: value === '' ? null : Number(value) }
                : r,
            ),
          }
        : d,
    )
  }
  return (
    <section className="commission-panel">
      <h2>Porcentagens {data ? `· ${data.employee.name}` : ''}</h2>
      <p>
        Comissão sobre o valor bruto, reconhecida na conclusão. Campo vazio
        significa pendência; 0% é uma configuração válida.
      </p>
      {error && (
        <p role="alert" className="booking-error">
          {error}{' '}
          <button type="button" onClick={() => setRevision((n) => n + 1)}>
            Recarregar
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Carregando porcentagens…</p>}
      {data && (
        <>
          <form className="booking-form" onSubmit={save}>
            <fieldset disabled={busy || !data.canManage}>
              {(['standardPercent', 'packagePercent'] as const).map((key) => (
                <section key={key}>
                  <h3>
                    {key === 'standardPercent'
                      ? 'Procedimentos avulsos'
                      : 'Procedimentos em pacotes'}
                  </h3>
                  {!data.items.length && <p>Nenhum procedimento habilitado.</p>}
                  {data.items.map((r, index) => (
                    <label className="commission-rate" key={r.treatmentId}>
                      <span>
                        {r.name}
                        <small>
                          {key === 'standardPercent'
                            ? 'Comissão em procedimento avulso (%)'
                            : 'Comissão em pacote (%)'}
                        </small>
                      </span>
                      <SalonInput
                        aria-label={`${r.name}: ${key === 'standardPercent' ? 'avulso' : 'pacote'} (%)`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={r[key] ?? ''}
                        placeholder="Não configurado"
                        onChange={(e) => update(index, key, e.target.value)}
                      />
                      {r[key] === null && (
                        <small className="commission-pending">Pendente</small>
                      )}
                    </label>
                  ))}
                </section>
              ))}
            </fieldset>
            {data.canManage && (
              <button className="primary-button" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar porcentagens'}
              </button>
            )}
          </form>
          {data.items.some(
            (r) => r.standardPercent === null || r.packagePercent === null,
          ) && (
            <p className="booking-alert">
              Configure os dois percentuais de cada procedimento antes de
              concluir atendimentos. Novas habilitações também precisam de
              configuração.
            </p>
          )}
          {data.audit.length > 0 && (
            <details>
              <summary>Histórico de alterações</summary>
              {data.audit.map((a) => (
                <article className="order-line" key={a.id}>
                  <strong>
                    {a.author} · {bookingDate(a.createdAt)}
                  </strong>
                  {a.current.map((r) => {
                    const previous = a.previous.find(
                      (p) => p.treatmentId === r.treatmentId,
                    )
                    return (
                      <small key={r.treatmentId}>
                        {data.items.find((t) => t.treatmentId === r.treatmentId)
                          ?.name ?? `Procedimento #${r.treatmentId}`}{' '}
                        · Avulso: {previous?.standardPercent ?? 'pendente'} →{' '}
                        {r.standardPercent ?? 'pendente'}% · Pacote:{' '}
                        {previous?.packagePercent ?? 'pendente'} →{' '}
                        {r.packagePercent ?? 'pendente'}%
                      </small>
                    )
                  })}
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  )
}
