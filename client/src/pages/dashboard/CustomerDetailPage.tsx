import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PackageHistory } from '../social/PackageHistory'
import { SalonModal } from '../../components/SalonModal'
import { BookingOrderModal } from '../booking/BookingOrderModal'
import {
  bookingDate,
  bookingStatus,
  cancellationText,
  money,
} from '../booking/bookingApi'
import { customerRequest } from './customersApi'
import type {
  CustomerDetail,
  CustomerAppointment,
  CustomerPayment,
  InternalNote,
  Page,
} from './customersApi'
import '../booking/booking.css'
import './customers.css'
export default function CustomerDetailPage() {
  const { id } = useParams(),
    [customer, setCustomer] = useState<CustomerDetail | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0)
  const [view, setView] = useState('all'),
    [historyPage, setHistoryPage] = useState(0),
    [history, setHistory] = useState<Page<CustomerAppointment>>({
      items: [],
      page: 0,
      total: 0,
      hasNext: false,
    }),
    [historyLoading, setHistoryLoading] = useState(true),
    [historyError, setHistoryError] = useState('')
  const [paymentsPage, setPaymentsPage] = useState(0),
    [payments, setPayments] = useState<Page<CustomerPayment>>({
      items: [],
      page: 0,
      total: 0,
      hasNext: false,
    }),
    [paymentsError, setPaymentsError] = useState(''),
    [paymentsLoading, setPaymentsLoading] = useState(true)
  const [notes, setNotes] = useState<InternalNote[]>([]),
    [note, setNote] = useState(''),
    [noteError, setNoteError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [orderId, setOrderId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    birthDate: '',
  })
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    customerRequest<CustomerDetail>(`/customers/${id}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setCustomer(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setCustomer(null)
          setError(cause.message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, revision])
  useEffect(() => {
    if (!customer || customer.id !== Number(id)) return
    const controller = new AbortController()
    setHistoryLoading(true)
    setHistoryError('')
    customerRequest<Page<CustomerAppointment>>(
      `/customers/${id}/history?${new URLSearchParams({ view, page: String(historyPage) })}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setHistory(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setHistoryError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [id, customer?.id, historyPage, view, revision])
  useEffect(() => {
    if (!customer || customer.id !== Number(id)) return
    const controller = new AbortController()
    setPaymentsLoading(true)
    setPaymentsError('')
    customerRequest<Page<CustomerPayment>>(
      `/customers/${id}/payments?page=${paymentsPage}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setPayments(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setPaymentsError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPaymentsLoading(false)
      })
    return () => controller.abort()
  }, [id, customer?.id, paymentsPage, revision])
  useEffect(() => {
    if (!customer?.canReadInternalNotes || customer.id !== Number(id)) {
      setNotes([])
      return
    }
    const controller = new AbortController()
    customerRequest<InternalNote[]>(`/customers/${id}/notes`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setNotes(data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setNoteError(cause.message)
      })
    return () => controller.abort()
  }, [id, customer?.id, customer?.canReadInternalNotes, revision])
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await customerRequest(`/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, birthDate: form.birthDate || null }),
      })
      setEditing(false)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save customer.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function addNote(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNoteError('')
    try {
      await customerRequest(`/customers/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: note }),
      })
      setNote('')
      setRevision((value) => value + 1)
    } catch (cause) {
      setNoteError(
        cause instanceof Error ? cause.message : 'Unable to save note.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="dashboard-view customer-view">
      <Link className="customer-link" to="/dashboard/clientes">
        ← Clientes
      </Link>
      {loading && !customer && <p role="status">Carregando cadastro…</p>}
      {error && !editing && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {customer && customer.id === Number(id) && (
        <>
          <header className="dashboard-view-header">
            <div>
              <span className="salon-eyebrow">História & cuidado</span>
              <h1>{customer.name}</h1>
              <p>
                CPF {customer.cpf} · {customer.email ?? 'Sem e-mail'} ·{' '}
                {customer.phone ?? 'Sem telefone'} · Nascimento:{' '}
                {customer.birthDate
                  ? customer.birthDate.split('-').reverse().join('/')
                  : 'Não informado'}
              </p>
            </div>
            {customer.canEdit && (
              <button
                className="primary-button"
                onClick={() => {
                  setForm({
                    birthDate: customer.birthDate ?? '',
                    name: customer.name,
                    cpf: customer.cpf,
                    email: customer.email ?? '',
                    phone: customer.phone ?? '',
                  })
                  setError('')
                  setEditing(true)
                }}
              >
                Editar cadastro
              </button>
            )}
          </header>
          {customer.historyScope === 'assigned' && (
            <p className="booking-availability-notice">
              Seu acesso mostra apenas os agendamentos vinculados a você. Os
              totais abaixo seguem esse mesmo escopo.
            </p>
          )}
          <div className="customer-metrics">
            <article>
              <span>Total efetivamente pago</span>
              <strong>{money(customer.totalPaid)}</strong>
              <small>Recebimentos menos estornos registrados</small>
            </article>
            <article>
              <span>Atendimentos concluídos</span>
              <strong>{customer.completedCount}</strong>
              <small>
                {customer.lastCompletedAt
                  ? `Último em ${bookingDate(customer.lastCompletedAt)}`
                  : 'Nenhum atendimento concluído'}
              </small>
            </article>
            <article>
              <span>Reservas futuras</span>
              <strong>{customer.upcomingCount}</strong>
              <small>Cancelamentos não ocupam a agenda</small>
            </article>
          </div>
          {editing && (
            <SalonModal
              title="Editar cliente"
              description="Atualize o cadastro único utilizado no agendamento público."
              busy={busy}
              onClose={() => setEditing(false)}
            >
              <form className="booking-form" onSubmit={save}>
                <fieldset disabled={busy}>
                  {(
                    ['name', 'cpf', 'email', 'phone', 'birthDate'] as const
                  ).map((field) => (
                    <label key={field}>
                      {
                        {
                          name: 'Nome completo',
                          cpf: 'CPF',
                          email: 'E-mail',
                          phone: 'Telefone',
                          birthDate: 'Data de nascimento',
                        }[field]
                      }
                      <input
                        required={field !== 'birthDate'}
                        max={
                          field === 'birthDate'
                            ? new Date().toLocaleDateString('en-CA', {
                                timeZone: 'America/Sao_Paulo',
                              })
                            : undefined
                        }
                        type={
                          field === 'birthDate'
                            ? 'date'
                            : field === 'email'
                              ? 'email'
                              : field === 'phone'
                                ? 'tel'
                                : 'text'
                        }
                        value={form[field]}
                        onChange={(event) =>
                          setForm({ ...form, [field]: event.target.value })
                        }
                        maxLength={field === 'cpf' ? 14 : 255}
                      />
                    </label>
                  ))}
                </fieldset>
                <p className="booking-note">
                  Alterar o e-mail atualiza o login e encerra as sessões do
                  cliente. A senha permanece a mesma.
                </p>
                {error && (
                  <p role="alert" className="booking-error">
                    {error}
                  </p>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy ? 'Salvando…' : 'Salvar cadastro'}
                </button>
              </form>
            </SalonModal>
          )}
          <PackageHistory
            customerId={customer.id}
            revision={revision}
            onOrder={setOrderId}
          />
          <section className="customer-section">
            <div className="customer-section-heading">
              <h2>Agendamentos e atendimentos</h2>
              <label>
                Exibir
                <select
                  value={view}
                  onChange={(event) => {
                    setView(event.target.value)
                    setHistoryPage(0)
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="upcoming">Futuros</option>
                  <option value="past">Anteriores</option>
                  <option value="completed">Procedimentos realizados</option>
                </select>
              </label>
            </div>
            {historyLoading && <p role="status">Carregando histórico…</p>}
            {historyError && <p role="alert">{historyError}</p>}
            {!historyLoading && !historyError && (
              <>
                <div className="booking-list">
                  {history.items.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => setOrderId(appointment.id)}
                    >
                      <span className={`booking-status ${appointment.status}`}>
                        {bookingStatus(appointment.status)}
                      </span>
                      <strong>
                        {bookingDate(appointment.startsAt)} · Comanda #
                        {appointment.id}
                      </strong>
                      {appointment.treatments?.map((treatment, index) => (
                        <span key={index}>
                          {treatment.name} · {treatment.employeeName} ·{' '}
                          {money(treatment.price)}
                        </span>
                      ))}
                      <span>
                        {appointment.status === 'completed'
                          ? `Realizado em ${bookingDate(appointment.completedAt!)}`
                          : 'Procedimentos previstos; atendimento ainda não concluído'}
                      </span>
                      <span>
                        Procedimentos: {money(appointment.treatmentTotal)} ·
                        Consumos: {money(appointment.extrasTotal)} · Pago
                        líquido: {money(appointment.netPaid)}
                      </span>
                      {appointment.status === 'cancelled' && (
                        <span>
                          {cancellationText(appointment.cancellationReason)}
                        </span>
                      )}
                      <small>Abrir comanda</small>
                    </button>
                  ))}
                </div>
                {!history.items.length && (
                  <p className="customer-empty">
                    Nenhum registro neste filtro.
                  </p>
                )}
                <nav
                  className="customer-pagination"
                  aria-label="Paginação de atendimentos"
                >
                  <button
                    disabled={!historyPage}
                    onClick={() => setHistoryPage((value) => value - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {historyPage + 1}</span>
                  <button
                    disabled={!history.hasNext}
                    onClick={() => setHistoryPage((value) => value + 1)}
                  >
                    Próxima
                  </button>
                </nav>
              </>
            )}
          </section>
          <section className="customer-section">
            <h2>Pagamentos registrados</h2>
            {paymentsLoading && <p role="status">Carregando pagamentos…</p>}
            {paymentsError && <p role="alert">{paymentsError}</p>}
            {!paymentsLoading && !paymentsError && (
              <>
                <div className="customer-payment-list">
                  {payments.items.map((payment) => (
                    <article key={payment.id}>
                      <strong>
                        {payment.kind === 'refund'
                          ? 'Estorno'
                          : payment.kind === 'deposit'
                            ? 'Sinal'
                            : 'Recebimento'}{' '}
                        · {money(payment.amount)}
                      </strong>
                      <span>
                        Comanda #{payment.orderId} · {payment.method} ·{' '}
                        {bookingDate(payment.createdAt)}
                      </span>
                      <p>{payment.description}</p>
                      {payment.refundOf && (
                        <small>
                          Referente ao recebimento #{payment.refundOf}
                        </small>
                      )}
                    </article>
                  ))}
                </div>
                {!payments.items.length && <p>Nenhum pagamento registrado.</p>}
                <nav
                  className="customer-pagination"
                  aria-label="Paginação de pagamentos"
                >
                  <button
                    disabled={!paymentsPage}
                    onClick={() => setPaymentsPage((value) => value - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {paymentsPage + 1}</span>
                  <button
                    disabled={!payments.hasNext}
                    onClick={() => setPaymentsPage((value) => value + 1)}
                  >
                    Próxima
                  </button>
                </nav>
              </>
            )}
          </section>
          {customer.canReadInternalNotes && (
            <section className="customer-section">
              <h2>Observações internas do cliente</h2>
              <p className="customer-muted">
                Restritas a ADMIN/MASTER. Observações do atendimento ficam na
                respectiva comanda.
              </p>
              <form className="booking-form" onSubmit={addNote}>
                <label>
                  Nova observação
                  <textarea
                    required
                    maxLength={4000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy || !note.trim()}
                >
                  Adicionar observação
                </button>
              </form>
              {noteError && <p role="alert">{noteError}</p>}
              {notes.map((item) => (
                <article className="customer-note" key={item.id}>
                  <p>{item.body}</p>
                  <small>
                    {item.author ?? 'Registro anterior'} ·{' '}
                    {bookingDate(item.createdAt)}
                  </small>
                </article>
              ))}
            </section>
          )}
          {orderId !== null && (
            <BookingOrderModal
              id={orderId}
              onClose={() => setOrderId(null)}
              onChanged={() => setRevision((value) => value + 1)}
            />
          )}
        </>
      )}
    </section>
  )
}
