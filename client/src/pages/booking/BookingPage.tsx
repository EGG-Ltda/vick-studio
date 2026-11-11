import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PackageBooking } from '../social/PackageBooking'
import { PackageHistory } from '../social/PackageHistory'
import logo from '../../assets/vick-florez-logo.webp'
import { BookingForm } from './BookingForm'
import {
  bookingDate,
  bookingRequest,
  bookingStatus,
  cancellationText,
  money,
} from './bookingApi'
import type {
  BookingCatalog,
  BookingOrder,
  CustomerSession,
} from './bookingApi'
import './booking.css'

function BookingSummary({ order }: { order: BookingOrder }) {
  return (
    <article className="booking-summary">
      <span className={`booking-status ${order.status}`}>
        {bookingStatus(order.status)}
      </span>
      <h3>
        Reserva #{order.id} · {order.employeeName}
      </h3>
      <p>{order.treatments?.map((treatment) => treatment.name).join(' + ')}</p>
      <p>
        {bookingDate(order.startsAt)} — {bookingDate(order.endsAt)} (Brasília)
      </p>
      <p>
        Total: {money(order.totalPrice)} · Sinal: {money(order.depositRequired)}
      </p>
      {order.status === 'awaiting_deposit' && (
        <>
          <p>
            Confirmação do sinal até{' '}
            <strong>{bookingDate(order.depositDueAt)}</strong>.
          </p>
          <p className="booking-instructions">{order.paymentInstructions}</p>
          <p>
            A equipe precisa confirmar o recebimento para garantir sua reserva.
          </p>
        </>
      )}
      {order.status === 'cancelled' && (
        <p>{cancellationText(order.cancellationReason)}</p>
      )}
      {order.depositConfirmedAt && (
        <p>Sinal confirmado em {bookingDate(order.depositConfirmedAt)}.</p>
      )}
    </article>
  )
}
export default function BookingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [packageRevision, setPackageRevision] = useState(0)
  const [isPackageSelected, setIsPackageSelected] = useState(false)
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('pacote')
    if (id && /^\d+$/.test(id)) sessionStorage.setItem('bookingPackage', id)
  }, [location.search])
  const isReservationPage = useLocation().pathname === '/agendar/reservar'
  const successHeading = useRef<HTMLHeadingElement>(null)
  const [session, setSession] = useState<CustomerSession | null>(null),
    [catalog, setCatalog] = useState<BookingCatalog | null>(null),
    [orders, setOrders] = useState<BookingOrder[]>([])
  const [mode, setMode] = useState<'entry' | 'register' | 'login'>('entry'),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState<BookingOrder | null>(null)
  const [form, setForm] = useState({
    birthDate: '',
    name: '',
    cpf: '',
    phone: '',
    email: '',
    password: '',
  })
  useEffect(() => {
    if (created) successHeading.current?.focus()
  }, [created])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      bookingRequest<BookingCatalog>('/booking/catalog', {
        signal: controller.signal,
      }),
      bookingRequest<CustomerSession>('/customer/session', {
        signal: controller.signal,
      }).catch(() => null),
    ])
      .then(([data, account]) => {
        if (!controller.signal.aborted) {
          setCatalog(data)
          setSession(account)
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    const refresh = () =>
      Promise.all([
        bookingRequest<BookingOrder[]>('/customer/bookings', {
          signal: controller.signal,
        }),
        bookingRequest<BookingCatalog>('/booking/catalog', {
          signal: controller.signal,
        }),
      ])
        .then(([data, currentCatalog]) => {
          if (!controller.signal.aborted) {
            setOrders(data)
            setCatalog(currentCatalog)
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message)
        })
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [session, created])
  async function authenticate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const account = await bookingRequest<CustomerSession>(
        `/customer/${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'register'
              ? form
              : { email: form.email, password: form.password },
          ),
        },
      )
      setSession(account)
      setForm({
        birthDate: '',
        name: '',
        cpf: '',
        phone: '',
        email: '',
        password: '',
      })
      navigate('/agendar/reservar', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    setBusy(true)
    try {
      await bookingRequest('/customer/logout', { method: 'POST' })
      setSession(null)
      setOrders([])
      setCreated(null)
      setMode('entry')
      navigate('/agendar', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally {
      setBusy(false)
    }
  }
  if (!loading && !session && isReservationPage)
    return <Navigate to="/agendar" replace />
  if (!loading && session && !isReservationPage)
    return <Navigate to="/agendar/reservar" replace />
  return (
    <main className={`booking-page${!session ? ' booking-page-auth' : ''}`}>
      <header className="booking-header">
        <Link to="/" aria-label="Voltar ao início">
          <img src={logo} alt="Vick Florez" />
        </Link>
        <span>Seu momento de florescer</span>
        {session && (
          <button type="button" disabled={busy} onClick={() => void logout()}>
            Sair da conta de cliente
          </button>
        )}
      </header>
      <div
        className={`booking-container${!session ? ' booking-container-auth' : ''}`}
      >
        <div className="booking-intro">
          <span className="salon-eyebrow">Agendamento online</span>
          <h1>
            {session
              ? `Olá, ${session.name.split(' ')[0]}`
              : 'Reserve seu cuidado'}
          </h1>
          <p>Escolha seu procedimento e um horário com a nossa equipe.</p>
        </div>
        {error && (
          <p className="booking-error" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Preparando sua experiência…</p>}
        {!loading && !session && (
          <section className="booking-auth">
            {mode === 'entry' ? (
              <div className="booking-entry">
                <button
                  className="primary-button"
                  onClick={() => setMode('register')}
                >
                  Primeiro agendamento
                </button>
                <button onClick={() => setMode('login')}>
                  Já tenho cadastro
                </button>
              </div>
            ) : (
              <form className="booking-form" onSubmit={authenticate}>
                <h2>
                  {mode === 'register'
                    ? 'Seu primeiro agendamento'
                    : 'Bem-vinda de volta'}
                </h2>
                <fieldset disabled={busy}>
                  {mode === 'register' && (
                    <>
                      <label>
                        Nome completo
                        <input
                          required
                          autoComplete="name"
                          minLength={3}
                          maxLength={255}
                          value={form.name}
                          onChange={(e) =>
                            setForm({ ...form, name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        CPF
                        <input
                          required
                          inputMode="numeric"
                          maxLength={14}
                          value={form.cpf}
                          onChange={(e) =>
                            setForm({ ...form, cpf: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Data de nascimento
                        <input
                          required
                          type="date"
                          autoComplete="bday"
                          max={new Date().toLocaleDateString('en-CA', {
                            timeZone: 'America/Sao_Paulo',
                          })}
                          value={form.birthDate}
                          onChange={(e) =>
                            setForm({ ...form, birthDate: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Telefone
                        <input
                          required
                          type="tel"
                          autoComplete="tel"
                          value={form.phone}
                          onChange={(e) =>
                            setForm({ ...form, phone: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label>
                    E-mail
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      maxLength={255}
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Senha
                    <input
                      required
                      type="password"
                      minLength={8}
                      maxLength={32}
                      autoComplete={
                        mode === 'register'
                          ? 'new-password'
                          : 'current-password'
                      }
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                    />
                  </label>
                  {mode === 'register' && (
                    <small>
                      Use de 8 a 32 caracteres. Seu acesso é exclusivo para
                      agendamentos.
                    </small>
                  )}
                </fieldset>
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? 'Aguarde…'
                    : mode === 'register'
                      ? 'Criar cadastro e continuar'
                      : 'Entrar'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode('entry')
                    setError('')
                  }}
                >
                  Voltar
                </button>
              </form>
            )}
          </section>
        )}
        {session && catalog && (
          <>
            <PackageBooking
              catalog={catalog}
              onSelectionChange={setIsPackageSelected}
              onBooked={() => {
                setPackageRevision((r) => r + 1)
                void bookingRequest<BookingOrder[]>('/customer/bookings')
                  .then(setOrders)
                  .catch((cause) => setError(cause.message))
              }}
            />
            <PackageHistory revision={packageRevision} />
            {created ? (
              <section aria-live="polite">
                <h2 ref={successHeading} tabIndex={-1}>
                  Solicitação registrada
                </h2>
                <BookingSummary
                  order={
                    orders.find((order) => order.id === created.id) ?? created
                  }
                />
                <button type="button" onClick={() => setCreated(null)}>
                  Agendar outro atendimento
                </button>
              </section>
            ) : (
              !isPackageSelected && (
                <BookingForm catalog={catalog} onBooked={setCreated} />
              )
            )}
            <section className="booking-history">
              <h2>Meus agendamentos</h2>
              {orders.length === 0 ? (
                <p>Você ainda não tem agendamentos.</p>
              ) : (
                orders.map((order) => (
                  <BookingSummary key={order.id} order={order} />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
