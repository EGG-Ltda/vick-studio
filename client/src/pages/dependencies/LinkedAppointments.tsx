import { useEffect, useState } from 'react'
import {
  bookingRequest,
  bookingDate,
  bookingStatus,
} from '../booking/bookingApi'
import { ruleText } from './ruleText'
import type { Plan } from './GroupBooking'
import './dependencies.css'
type Linked = {
  id: number
  rules: Plan['rules']
  needsAttention: boolean
  members: {
    id: number
    key: string
    name: string
    employeeName: string
    startsAt: string
    endsAt: string
    status: string
    canOpen: boolean
  }[]
}
export function LinkedAppointments({
  id,
  revision,
}: {
  id: number
  revision: number | string
}) {
  const [data, setData] = useState<Linked | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    const c = new AbortController()
    const refresh = () =>
      bookingRequest<Linked | null>(`/orders/${id}/dependencies`, {
        signal: c.signal,
      })
        .then((d) => {
          if (!c.signal.aborted) {
            setData(d)
            setError('')
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message)
        })
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => {
      clearInterval(timer)
      c.abort()
    }
  }, [id, revision])
  if (error)
    return (
      <p className="booking-error" role="alert">
        {error}
      </p>
    )
  if (!data) return null
  return (
    <section className="dependency-linked">
      <h3>Atendimentos vinculados · conjunto #{data.id}</h3>
      {data.needsAttention && (
        <p className="booking-error" role="status">
          Este conjunto contém cancelamento ou falta e precisa de revisão da
          equipe. Os outros atendimentos e pagamentos não foram alterados
          automaticamente.
        </p>
      )}
      <ul>
        {data.members.map((m) => (
          <li key={m.id}>
            <strong>
              Comanda #{m.id} · {m.name}
            </strong>
            <br />
            {bookingDate(m.startsAt)} · {bookingStatus(m.status)}
            {' · '}
            {m.employeeName}
            {m.id === id ? ' · atendimento atual' : ''}
          </li>
        ))}
      </ul>
      {!!data.rules.length && (
        <>
          <strong>Condições registradas na reserva</strong>
          <ul>
            {data.rules.map((r, i) => (
              <li key={i}>{ruleText(r)}</li>
            ))}
          </ul>
        </>
      )}
      <p>
        Remarcações devem respeitar estas condições. Cancelar, registrar falta
        ou devolver uma utilização afeta somente a comanda escolhida. Revise o
        conjunto e regularize os demais atendimentos quando necessário.
      </p>
    </section>
  )
}
