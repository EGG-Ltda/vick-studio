import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  BookingCatalog,
  BookingOrder,
  BookingSlot,
} from '../booking/bookingApi'
import { bookingRequest, bookingDate, money } from '../booking/bookingApi'
import type { Dependency } from '../../core/api/treatments'
import './dependencies.css'
import { ruleText } from './ruleText'
type Node = {
  key: string
  treatmentId: number
  name: string
  price: number
  chargedPrice: number
  durationMinutes: number
  included: boolean
  blocked: string | null
}
type Rule = Dependency & {
  main: string
  required: string
  mainName: string
  requiredName: string
}
export type Plan = {
  nodes: Node[]
  rules: Rule[]
  signature: string
  promotionId: number | null
  rootIds: number[]
}
type Choice = {
  key: string
  employeeId: number
  slot: BookingSlot
  depositDeadline?: string
}
const salonDay = (v: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(v))
function validation(plan: Plan, choices: Record<string, Choice | null>) {
  if (plan.nodes.some((n) => !choices[n.key])) return ''
  for (const r of plan.rules) {
    const m = choices[r.main]!,
      d = choices[r.required]!,
      before = r.position === 'before' ? d : m,
      after = r.position === 'before' ? m : d,
      gap =
        (Date.parse(after.slot.startsAt) - Date.parse(before.slot.endsAt)) /
        60000
    if (
      gap < r.minMinutes ||
      (r.maxMinutes !== null && gap > r.maxMinutes) ||
      (r.consecutive && gap !== 0) ||
      (r.sameDay && salonDay(m.slot.startsAt) !== salonDay(d.slot.startsAt))
    )
      return `Ajuste os horários: ${ruleText(r)}.`
  }
  const selected = plan.nodes.map((n) => choices[n.key]!)
  for (let i = 0; i < selected.length; i++)
    for (let j = i + 1; j < selected.length; j++)
      if (
        Date.parse(selected[i].slot.startsAt) <
          Date.parse(selected[j].slot.endsAt) &&
        Date.parse(selected[j].slot.startsAt) <
          Date.parse(selected[i].slot.endsAt)
      )
        return 'Os procedimentos da cliente não podem acontecer ao mesmo tempo, mesmo com profissionais diferentes.'
  return ''
}
function ProcedureChoice({
  node,
  catalog,
  staff,
  disabled,
  onChange,
  requiredFor,
}: {
  node: Node
  catalog: BookingCatalog
  staff: boolean
  disabled: boolean
  onChange: (c: Choice | null) => void
  requiredFor: string
}) {
  const [employee, setEmployee] = useState(''),
    [date, setDate] = useState(''),
    [deadline, setDeadline] = useState(''),
    [slots, setSlots] = useState<BookingSlot[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState('')
  const requestKey = [employee, date, deadline].join('|'),
    ready = !!employee && !!date && (!staff || !!deadline)
  useEffect(() => {
    if (!ready) return
    const c = new AbortController(),
      params = new URLSearchParams({
        employeeId: employee,
        date,
        treatmentIds: String(node.treatmentId),
      })
    if (staff)
      params.set('depositDeadline', new Date(deadline + '-03:00').toISOString())
    bookingRequest<BookingSlot[]>(
      `${staff ? '/booking/staff-slots' : '/customer/slots'}?${params}`,
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) {
          setSlots(d)
          setError('')
          setLoaded(requestKey)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setLoaded(requestKey)
        }
      })
    return () => c.abort()
  }, [employee, date, deadline, node.treatmentId, staff, ready, requestKey])
  function reset() {
    setSelected('')
    setSlots([])
    setError('')
    onChange(null)
  }
  const employees = catalog.employees.filter((e) =>
    e.treatmentIds.includes(node.treatmentId),
  )
  return (
    <article className="dependency-step">
      <h3>{node.name}</h3>
      {requiredFor && (
        <p className="booking-note">
          Procedimento obrigatório para: {requiredFor}.
        </p>
      )}
      <div className="dependency-subtotal">
        <span>{node.durationMinutes} minutos</span>
        <strong>
          {node.included
            ? `${money(node.chargedPrice)} · incluído no pacote`
            : money(node.price)}
        </strong>
      </div>
      {node.blocked && (
        <p className="booking-error" role="alert">
          Este procedimento está indisponível:{' '}
          {node.blocked === 'Required service is inactive.'
            ? 'serviço desativado.'
            : 'nenhuma profissional habilitada com expediente disponível.'}
        </p>
      )}
      <label>
        Profissional para {node.name}
        <select
          required
          value={employee}
          disabled={disabled || !!node.blocked}
          onChange={(e) => {
            setEmployee(e.target.value)
            reset()
          }}
        >
          <option value="">Selecione</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Data de {node.name}
        <input
          type="date"
          required
          min={salonDay(new Date().toISOString())}
          disabled={disabled || !employee}
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            reset()
          }}
        />
      </label>
      {staff && (
        <label>
          Prazo do sinal · {node.name} (Brasília)
          <input
            type="datetime-local"
            required
            disabled={disabled}
            value={deadline}
            onChange={(e) => {
              setDeadline(e.target.value)
              reset()
            }}
          />
        </label>
      )}
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      {ready && loaded !== requestKey ? (
        <p role="status">Consultando horários…</p>
      ) : (
        ready &&
        !error && (
          <>
            <div
              className="booking-slots"
              role="group"
              aria-label={`Horários de ${node.name}`}
            >
              {slots.map((s) => (
                <button
                  type="button"
                  disabled={disabled}
                  key={s.startsAt}
                  aria-pressed={selected === s.startsAt}
                  onClick={() => {
                    setSelected(s.startsAt)
                    onChange({
                      key: node.key,
                      employeeId: Number(employee),
                      slot: s,
                      ...(staff
                        ? {
                            depositDeadline: new Date(
                              deadline + '-03:00',
                            ).toISOString(),
                          }
                        : {}),
                    })
                  }}
                >
                  {new Intl.DateTimeFormat('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(s.startsAt))}
                </button>
              ))}
            </div>
            {!slots.length && (
              <p>
                Nenhum horário disponível. Escolha outra data ou profissional.
              </p>
            )}
          </>
        )
      )}
    </article>
  )
}
export function GroupBooking({
  catalog,
  rootIds = [],
  promotionId,
  packageConditions,
  staff = false,
  customerId,
  onBooked,
}: {
  catalog: BookingCatalog
  rootIds?: number[]
  promotionId?: number
  packageConditions?: {
    expectedPrice: number
    expectedConditions: string
    expectedValidUntil: string
  }
  staff?: boolean
  customerId?: number
  onBooked: (orders: BookingOrder[]) => void
}) {
  const rootsKey = rootIds.join(','),
    [plan, setPlan] = useState<Plan | null>(null),
    [choices, setChoices] = useState<Record<string, Choice | null>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [separate, setSeparate] = useState<
      { main: string; requiredTreatmentId: number }[]
    >([]),
    [loaded, setLoaded] = useState('')
  const key = useRef<{ fingerprint: string; key: string } | null>(null),
    separateKey = JSON.stringify(separate),
    selectionKey = `${rootsKey}|${promotionId ?? ''}|${revision}|${separateKey}`
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<Plan>('/booking/dependency-plan', {
      method: 'POST',
      body: JSON.stringify({
        rootIds: rootsKey ? rootsKey.split(',').map(Number) : [],
        promotionId,
        separate: JSON.parse(separateKey),
      }),
      signal: c.signal,
    })
      .then((p) => {
        if (!c.signal.aborted) {
          setPlan(p)
          setChoices({})
          setError('')
          setLoaded(selectionKey)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setLoaded(selectionKey)
          setPlan(null)
        }
      })
    return () => c.abort()
  }, [rootsKey, promotionId, revision, selectionKey, separateKey])
  const complete = !!plan && plan.nodes.every((n) => choices[n.key]),
    problem = plan ? validation(plan, choices) : '',
    blocked = plan?.nodes.some((n) => n.blocked),
    pending = loaded !== selectionKey
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!plan || !complete || problem || blocked) return
    setBusy(true)
    setError('')
    try {
      const body = {
        rootIds: promotionId ? [] : rootIds,
        promotionId,
        expectedPlan: plan.signature,
        separate,
        ...(staff ? { customerId } : {}),
        packageConditions,
        appointments: plan.nodes.map((n) => {
          const c = choices[n.key]!
          return {
            key: n.key,
            employeeId: c.employeeId,
            startsAt: c.slot.startsAt,
            expectedTotal: c.slot.total,
            expectedDeposit: c.slot.deposit,
            expectedDeadline: c.slot.deadline,
            expectedInstructions: c.slot.instructions,
            depositDeadline: c.depositDeadline,
          }
        }),
      }
      const fingerprint = JSON.stringify(body)
      if (key.current?.fingerprint !== fingerprint)
        key.current = { fingerprint, key: crypto.randomUUID() }
      const result = await bookingRequest<{ bookings: BookingOrder[] }>(
        staff ? '/booking/staff-groups' : '/customer/booking-groups',
        {
          method: 'POST',
          body: JSON.stringify({ ...body, requestKey: key.current.key }),
        },
      )
      onBooked(result.bookings)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to reserve the linked appointments.',
      )
    } finally {
      setBusy(false)
    }
  }
  const extras =
    plan?.nodes
      .filter((n) => !n.included)
      .reduce((s, n) => s + Math.round(n.price * 100), 0) ?? 0
  return (
    <form className="dependency-booking" onSubmit={submit}>
      {pending ? (
        <p role="status">Verificando procedimentos obrigatórios…</p>
      ) : (
        plan && (
          <>
            {!!plan.rules.length && (
              <section className="dependency-rules">
                <h3>Estes cuidados precisam ser agendados juntos</h3>
                <ul>
                  {plan.rules.map((r, i) => (
                    <li key={i}>
                      {ruleText(r)}
                      {plan.rules.filter((x) => x.required === r.required)
                        .length > 1 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setSeparate((v) => [
                              ...v,
                              {
                                main: r.main,
                                requiredTreatmentId: r.requiredTreatmentId,
                              },
                            ])
                          }
                        >
                          Reservar outra realização para {r.mainName}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p>
                  Uma única realização do procedimento obrigatório é
                  reaproveitada quando atende a mais de um serviço selecionado.
                  Nenhum horário será reservado antes da confirmação de todo o
                  conjunto.
                </p>
                {separate.length > 0 ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSeparate([])}
                  >
                    Voltar a compartilhar procedimentos obrigatórios
                  </button>
                ) : (
                  plan.rules.some(
                    (r) =>
                      plan.rules.filter((x) => x.required === r.required)
                        .length > 1,
                  ) && (
                    <p>
                      Se as datas exigirem realizações diferentes, escolha
                      “Reservar outra realização”. O procedimento adicional terá
                      preço e sinal próprios.
                    </p>
                  )
                )}
              </section>
            )}
            {promotionId && (
              <p className="booking-availability-notice">
                O pacote permanece sem sinal. Procedimentos obrigatórios
                adicionais, quando não incluídos no pacote, são cobrados
                separadamente e seguem a regra de sinal do salão.
              </p>
            )}
            {plan.nodes.map((n) => (
              <ProcedureChoice
                key={`${selectionKey}-${n.key}`}
                node={n}
                requiredFor={plan.rules
                  .filter((r) => r.required === n.key)
                  .map((r) => r.mainName)
                  .join(' + ')}
                catalog={catalog}
                staff={staff}
                disabled={busy || (!staff && !catalog.settings.enabled)}
                onChange={(c) => setChoices((v) => ({ ...v, [n.key]: c }))}
              />
            ))}
            <section className="booking-review">
              <h3>Resumo do conjunto</h3>
              {plan.nodes.map((n) => {
                const c = choices[n.key]
                return (
                  <div key={n.key} className="dependency-rule">
                    <strong>
                      {n.name} ·{' '}
                      {n.included
                        ? `${money(n.chargedPrice)} · incluído no pacote`
                        : money(n.price)}
                    </strong>
                    {c ? (
                      <>
                        <span>
                          {
                            catalog.employees.find((e) => e.id === c.employeeId)
                              ?.name
                          }{' '}
                          · {bookingDate(c.slot.startsAt)} · {c.slot.duration}{' '}
                          min
                        </span>
                        {!n.included && (
                          <span>
                            Sinal: {money(c.slot.deposit)} · confirmar até{' '}
                            {bookingDate(c.slot.deadline)} (Brasília)
                          </span>
                        )}
                        {!n.included && <small>{c.slot.instructions}</small>}
                      </>
                    ) : (
                      <span>Escolha profissional, data e horário.</span>
                    )}
                  </div>
                )
              })}
              <p>
                Total:{' '}
                <strong>
                  {money(
                    (Math.round((packageConditions?.expectedPrice ?? 0) * 100) +
                      extras) /
                      100,
                  )}
                </strong>
                {promotionId &&
                  ` · pacote: ${money(packageConditions?.expectedPrice ?? 0)} · adicionais: ${money(extras / 100)}`}
              </p>
              <p>
                Reservas com sinal aguardam confirmação da equipe. O vencimento
                cancela somente a respectiva reserva; os demais atendimentos
                ficam identificados para regularização pela equipe.
              </p>
            </section>
            {problem && (
              <p className="booking-error" role="alert">
                {problem}
              </p>
            )}
          </>
        )
      )}
      {error && (
        <p className="booking-error" role="alert">
          {error}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            Atualizar condições e escolher horários novamente
          </button>
        </p>
      )}
      <button
        className="primary-button"
        disabled={
          pending ||
          !complete ||
          !!problem ||
          blocked ||
          busy ||
          (staff && !customerId) ||
          (!staff && !catalog.settings.enabled)
        }
      >
        {busy ? 'Validando e reservando…' : 'Confirmar todos os atendimentos'}
      </button>
    </form>
  )
}
