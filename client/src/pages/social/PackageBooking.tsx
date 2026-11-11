import { useEffect, useState } from 'react'
import type { BookingCatalog } from '../booking/bookingApi'
import { bookingRequest, money, bookingDate } from '../booking/bookingApi'
import type { Promotion } from './socialApi'
import { GroupBooking } from '../dependencies/GroupBooking'
import './social.css'
export function PackageBooking({
  catalog,
  onBooked,
  onSelectionChange,
}: {
  catalog: BookingCatalog
  onBooked: () => void
  onSelectionChange: (v: boolean) => void
}) {
  const [items, setItems] = useState<Promotion[]>([]),
    [validUntil, setValidUntil] = useState(''),
    [selected, setSelected] = useState(
      () => sessionStorage.getItem('bookingPackage') ?? '',
    ),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<{ items: Promotion[]; validUntil: string }>(
      '/public/promotions',
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) {
          setItems(d.items)
          setValidUntil(d.validUntil)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [])
  const p = items.find((i) => String(i.id) === selected),
    hasSelection = !!p
  useEffect(() => {
    onSelectionChange(hasSelection)
  }, [hasSelection, onSelectionChange])
  if (!loading && !items.length && !error) return null
  return (
    <section className="package-booking">
      <span className="salon-eyebrow">Cuidados que se completam</span>
      <h2>Escolha um pacote</h2>
      {loading && <p role="status">Carregando pacotes…</p>}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <label>
        Pacote disponível
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setNotice('')
          }}
        >
          <option value="">Prefiro agendar serviços avulsos</option>
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {money(p.price)}
            </option>
          ))}
        </select>
      </label>
      {p && (
        <>
          <p>{p.description}</p>
          <strong>Pacote: {money(p.price)}</strong>
          <p>{p.conditions}</p>
          <p>
            Os procedimentos incluídos no pacote devem terminar até{' '}
            {bookingDate(validUntil)} (Brasília). Os serviços obrigatórios não
            incluídos são apresentados e cobrados separadamente.
          </p>
          <GroupBooking
            key={p.id}
            catalog={catalog}
            promotionId={p.id}
            packageConditions={{
              expectedPrice: p.price,
              expectedConditions: p.conditions,
              expectedValidUntil: validUntil,
            }}
            onBooked={(orders) => {
              setNotice(
                `Conjunto #${orders[0]?.groupId} reservado. Confira cada atendimento e os sinais dos adicionais, se houver.`,
              )
              setSelected('')
              sessionStorage.removeItem('bookingPackage')
              onBooked()
            }}
          />
        </>
      )}
    </section>
  )
}
