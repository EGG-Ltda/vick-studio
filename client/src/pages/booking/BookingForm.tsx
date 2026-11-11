import { useEffect, useState } from 'react'
import { bookingRequest, money } from './bookingApi'
import type { BookingCatalog, BookingOrder } from './bookingApi'
import { GroupBooking } from '../dependencies/GroupBooking'
export function BookingForm({
  catalog,
  onBooked,
  staff = false,
}: {
  catalog: BookingCatalog
  onBooked: (order: BookingOrder) => void
  staff?: boolean
}) {
  const [roots, setRoots] = useState<number[]>([]),
    [search, setSearch] = useState(''),
    [customers, setCustomers] = useState<
      { id: number; name: string; email: string }[]
    >([]),
    [customer, setCustomer] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    if (!staff || search.trim().length < 2) return
    const c = new AbortController(),
      timer = setTimeout(() => {
        bookingRequest<{ id: number; name: string; email: string }[]>(
          `/booking/customers?${new URLSearchParams({ search })}`,
          { signal: c.signal },
        )
          .then((d) => {
            if (!c.signal.aborted) {
              setCustomers(d)
              setError('')
            }
          })
          .catch((e) => {
            if (!c.signal.aborted) setError(e.message)
          })
      }, 250)
    return () => {
      clearTimeout(timer)
      c.abort()
    }
  }, [search, staff])
  return (
    <div className="booking-form">
      {!catalog.settings.enabled && !staff && (
        <p className="booking-availability-notice">
          O agendamento online está temporariamente indisponível. Entre em
          contato com o salão.
        </p>
      )}
      {!catalog.employees.length && (
        <p className="booking-availability-notice">
          Ainda não há profissionais disponíveis. A equipe precisa cadastrar as
          profissionais, habilitações e expedientes.
        </p>
      )}
      {staff && (
        <>
          <label>
            Buscar cliente cadastrado
            <input
              value={search}
              placeholder="Nome, CPF, telefone ou e-mail"
              onChange={(e) => {
                setSearch(e.target.value)
                setCustomer('')
                setCustomers([])
              }}
            />
          </label>
          <label>
            Cliente
            <select
              required
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">Selecione</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="booking-error">
              {error}
            </p>
          )}
        </>
      )}
      <fieldset>
        <legend>Selecione os serviços desejados</legend>
        <div
          className="booking-treatments"
          role="group"
          aria-label="Procedimentos"
        >
          {catalog.treatments.map((t) => (
            <label key={t.id} className="booking-choice">
              <input
                type="checkbox"
                checked={roots.includes(t.id)}
                onChange={(e) =>
                  setRoots((v) =>
                    e.target.checked
                      ? [...v, t.id].sort((a, b) => a - b)
                      : v.filter((id) => id !== t.id),
                  )
                }
              />
              <span>
                <strong>{t.name}</strong>
                <small>
                  {money(t.price)} · {t.durationMinutes} min · adicionais
                  obrigatórios serão apresentados abaixo
                </small>
              </span>
            </label>
          ))}
        </div>
        {!catalog.treatments.length && (
          <p>Nenhum procedimento disponível no momento.</p>
        )}
      </fieldset>
      {roots.length > 0 && (
        <GroupBooking
          key={roots.join(',')}
          catalog={catalog}
          rootIds={roots}
          staff={staff}
          customerId={Number(customer) || undefined}
          onBooked={(orders) => {
            setRoots([])
            onBooked(orders[0])
          }}
        />
      )}
    </div>
  )
}
