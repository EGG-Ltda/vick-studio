import { useEffect, useRef, useState } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import type { BookingCatalog } from '../booking/bookingApi'
import { bookingRequest, money, bookingDate } from '../booking/bookingApi'
import { ProcedureChoice } from '../dependencies/GroupBooking'
import type { Plan, Choice } from '../dependencies/GroupBooking'
import { ruleText } from '../dependencies/ruleText'
import { packageSet, packageSlotAllowed } from './packageSelection'
import { packageUseLabel, minimumPackagePayment } from './socialApi'
import type { Promotion, PackagePurchase } from './socialApi'
import './social.css'
type Preview = {
  terms: {
    title: string
    description?: string
    price: number
    conditions: string
    validUntil: string
    minimumPaymentPercent: number | null
  }
  plan: Plan
  available: string[]
}
type Result = {
  package: {
    title: string
    price: number
    minimumPaymentPercent: number | null
    minimumPayment: number | null
    validUntil: string
  }
  purchaseId: number
  appointments: {
    key: string
    name: string
    employeeName: string
    startsAt: string
    endsAt: string
    included: boolean
    price: number | null
    deposit: number | null
    deadline: string | null
  }[]
}
function PackageWizard({
  selection,
  catalog,
  onBooked,
}: {
  selection: { promotionId?: number; purchaseId?: number }
  catalog: BookingCatalog
  onBooked: (r: Result) => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [choices, setChoices] = useState<Record<string, Choice | null>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true)
  const request = useRef<{ body: string; key: string } | null>(null),
    selectionKey = JSON.stringify(selection)
  useEffect(() => {
    const c = new AbortController()
    bookingRequest<Preview>('/customer/package-plan', {
      method: 'POST',
      body: selectionKey,
      signal: c.signal,
    })
      .then((p) => {
        if (!c.signal.aborted) {
          setPreview(p)
          const first = p.plan.nodes.find(
            (n) =>
              n.included &&
              p.available.includes(n.key) &&
              packageSet(p.plan, n.key).every((k) => {
                const node = p.plan.nodes.find((n) => n.key === k)!
                return !node.included || p.available.includes(k)
              }),
          )
          setSelected(first ? packageSet(p.plan, first.key) : [])
          setChoices({})
          setError('')
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => c.abort()
  }, [selectionKey, revision])
  if (loading) return <p role="status">Preparando os cuidados do seu pacote…</p>
  if (!preview)
    return (
      <p role="alert" className="booking-error">
        {error}
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            setRevision((r) => r + 1)
          }}
        >
          Tentar novamente
        </button>
      </p>
    )
  const { plan, terms } = preview,
    nodes = plan.nodes.filter((n) => selected.includes(n.key)),
    complete =
      nodes.length > 0 && nodes.every((n) => choices[n.key] && !n.blocked),
    extras =
      nodes
        .filter((n) => !n.included)
        .reduce((sum, n) => sum + Math.round(n.price * 100), 0) / 100
  const uniqueRules = [
    ...new Map(
      plan.rules
        .filter((r) => selected.includes(r.main))
        .map((r) => [ruleText(r), r]),
    ).values(),
  ]
  return (
    <form
      className="dependency-booking package-wizard"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!complete) return
        setBusy(true)
        setError('')
        const body = JSON.stringify({
          ...selection,
          expectedPlan: plan.signature,
          appointments: nodes.map((n) => {
            const c = choices[n.key]!
            return {
              key: n.key,
              employeeId: c.employeeId,
              startsAt: c.slot.startsAt,
              expectedTotal: c.slot.total,
              expectedDeposit: c.slot.deposit,
              expectedDeadline: c.slot.deadline,
              expectedInstructions: c.slot.instructions,
            }
          }),
        })
        if (request.current?.body !== body)
          request.current = { body, key: crypto.randomUUID() }
        try {
          const r = await bookingRequest<Result>(
            '/customer/package-reservations',
            {
              method: 'POST',
              body: JSON.stringify({
                ...JSON.parse(body),
                requestKey: request.current.key,
              }),
            },
          )
          onBooked(r)
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Não foi possível reservar.',
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <header className="package-overview">
        <h3>{terms.title}</h3>
        {terms.description && <p>{terms.description}</p>}
        <strong>
          {selection.purchaseId
            ? 'Valor do pacote adquirido'
            : 'Valor total do pacote'}
          : {money(terms.price)}
        </strong>
        <p>{terms.conditions}</p>
        <p>Utilize até {bookingDate(terms.validUntil)} (Brasília).</p>
        <p>
          {terms.minimumPaymentPercent === null
            ? 'A equipe precisa configurar o pagamento mínimo antes dos atendimentos.'
            : `Para realizar os atendimentos, a equipe deve confirmar ${terms.minimumPaymentPercent}% do pacote: ${money(minimumPackagePayment(terms.price, terms.minimumPaymentPercent))} líquidos recebidos.`}{' '}
          Você pode reservar os horários antes do pagamento.
        </p>
      </header>
      <fieldset disabled={busy}>
        <legend>O que deseja agendar agora?</legend>
        <p>
          Escolha um conjunto de cuidados. As utilizações restantes ficam
          disponíveis até o fim da validade.
        </p>
        <div className="package-use-options">
          {plan.nodes
            .filter((n) => n.included && preview.available.includes(n.key))
            .map((n) => {
              const group = packageSet(plan, n.key),
                possible = group.every((k) => {
                  const item = plan.nodes.find((n) => n.key === k)!
                  return !item.included || preview.available.includes(k)
                }),
                siblings = plan.nodes.filter(
                  (x) => x.included && x.treatmentId === n.treatmentId,
                )
              return (
                <label className="booking-choice" key={n.key}>
                  <SalonInput
                    type="checkbox"
                    disabled={!possible}
                    checked={selected.includes(n.key)}
                    onChange={(e) => {
                      setSelected((v) =>
                        e.target.checked
                          ? [...new Set([...v, ...group])]
                          : v.filter((k) => !group.includes(k)),
                      )
                      setChoices({})
                    }}
                  />
                  <span>
                    {n.name} · utilização{' '}
                    {siblings.findIndex((x) => x.key === n.key) + 1} de{' '}
                    {siblings.length}
                    {!possible && ' · solicite orientação ao salão'}
                  </span>
                </label>
              )
            })}
        </div>
      </fieldset>
      {!!uniqueRules.length && (
        <aside className="dependency-rules">
          <h3>Cuidados que precisam ser feitos juntos</h3>
          <ul>
            {uniqueRules.map((r) => (
              <li key={ruleText(r)}>{ruleText(r)}</li>
            ))}
          </ul>
          <p>
            Os horários abaixo seguem a sequência necessária. Você pode escolher
            profissionais diferentes.
          </p>
        </aside>
      )}
      {nodes.map((n, index) => {
        const previous = nodes.slice(0, index),
          ready = previous.every((n) => choices[n.key])
        return (
          <section key={n.key}>
            <p className="salon-eyebrow">
              Atendimento {index + 1} de {nodes.length}
            </p>
            {!ready && (
              <p className="booking-note">
                Escolha o horário do atendimento anterior para continuar.
              </p>
            )}
            <ProcedureChoice
              key={
                selected.join(',') +
                '|' +
                n.key +
                '|' +
                JSON.stringify(previous.map((n) => choices[n.key]))
              }
              node={n}
              catalog={catalog}
              staff={false}
              disabled={busy || !ready || !catalog.settings.enabled}
              requiredFor=""
              packageSelection={selection}
              slotAllowed={(slot) =>
                packageSlotAllowed(plan, n.key, slot, choices)
              }
              onChange={(choice) =>
                setChoices((v) => ({
                  ...Object.fromEntries(
                    Object.entries(v).filter(
                      ([k]) => !nodes.slice(index).some((n) => n.key === k),
                    ),
                  ),
                  [n.key]: choice,
                }))
              }
            />
          </section>
        )
      })}
      {!!nodes.length && (
        <section className="booking-review">
          <h3>Confira sua escolha</h3>
          {nodes.map((n) => (
            <p key={n.key}>
              <strong>{n.name}</strong> ·{' '}
              {n.included
                ? 'Incluído no pacote'
                : `Adicional: ${money(n.price)}`}
              <br />
              {choices[n.key]
                ? `${catalog.employees.find((e) => e.id === choices[n.key]!.employeeId)?.name} · ${bookingDate(choices[n.key]!.slot.startsAt)}`
                : 'Escolha profissional, dia e horário.'}
              {!n.included && choices[n.key] && (
                <>
                  <br />
                  Sinal do adicional: {money(
                    choices[n.key]!.slot.deposit,
                  )} até {bookingDate(choices[n.key]!.slot.deadline)}.
                </>
              )}
            </p>
          ))}
          <strong>
            {selection.purchaseId
              ? 'Nenhuma nova compra do pacote.'
              : `Pacote: ${money(terms.price)}.`}{' '}
            {extras > 0
              ? `Adicionais: ${money(extras)}.`
              : 'Sem procedimentos adicionais cobrados.'}
          </strong>
          <p>
            {preview.available.length - nodes.filter((n) => n.included).length}{' '}
            utilização(ões) permanecerão disponíveis para escolher depois.
          </p>
        </section>
      )}
      {error && (
        <div role="alert" className="booking-error">
          {error}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setLoading(true)
              setRevision((r) => r + 1)
            }}
          >
            Atualizar saldo e horários
          </button>
        </div>
      )}
      <button
        className="primary-button"
        disabled={busy || !complete || !catalog.settings.enabled}
      >
        {busy ? 'Reservando…' : 'Confirmar horários selecionados'}
      </button>
    </form>
  )
}
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
    [purchases, setPurchases] = useState<PackagePurchase[]>([]),
    [selected, setSelected] = useState(() => {
      const id = sessionStorage.getItem('bookingPackage')
      return id ? 'new:' + id : ''
    }),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState<Result | null>(null)
  useEffect(() => {
    const c = new AbortController()
    Promise.all([
      bookingRequest<{ items: Promotion[] }>('/public/promotions', {
        signal: c.signal,
      }),
      bookingRequest<PackagePurchase[]>('/customer/packages', {
        signal: c.signal,
      }),
    ])
      .then(([p, owned]) => {
        if (!c.signal.aborted) {
          setItems(p.items)
          setPurchases(owned)
          setError('')
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => c.abort()
  }, [revision])
  const promotion = items.find((p) => selected === 'new:' + p.id),
    purchase = purchases.find((p) => selected === 'owned:' + p.id),
    active = !!promotion || !!purchase
  useEffect(() => onSelectionChange(active), [active, onSelectionChange])
  const remaining = purchases.filter(
    (p) => !p.expired && p.uses?.some((u) => u.state === 'available'),
  )
  return (
    <section className="package-booking">
      <span className="salon-eyebrow">Cuidados que se completam</span>
      <h2>Pacotes para você</h2>
      {loading && <p role="status">Carregando pacotes…</p>}
      {error && (
        <p role="alert" className="booking-error">
          {error}
          <button type="button" onClick={() => setRevision((r) => r + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {remaining.map((p) => (
        <aside className="package-balance" key={p.id}>
          <h3>Você ainda tem cuidados disponíveis</h3>
          <p>
            {p.title}:{' '}
            {Object.entries(
              p.uses
                .filter((u) => u.state === 'available')
                .reduce<
                  Record<string, number>
                >((counts, u) => ({ ...counts, [u.name]: (counts[u.name] ?? 0) + 1 }), {}),
            )
              .map(([name, count]) => `${count} atendimento(s) de ${name}`)
              .join(' e ')}
            .
          </p>
          <p>Validade: {bookingDate(p.validUntil)}.</p>
          <button
            type="button"
            onClick={() => {
              setSelected('owned:' + p.id)
              setResult(null)
            }}
          >
            Agendar utilizações restantes
          </button>
        </aside>
      ))}
      <label>
        Como deseja agendar?
        <SalonSelect
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setResult(null)
          }}
        >
          <option value="">Prefiro agendar serviços avulsos</option>
          {remaining.map((p) => (
            <option value={'owned:' + p.id} key={'owned' + p.id}>
              Usar saldo · {p.title}
            </option>
          ))}
          {items.map((p) => (
            <option value={'new:' + p.id} key={'new' + p.id}>
              {p.title} · {money(p.price)}
            </option>
          ))}
        </SalonSelect>
      </label>
      {promotion && (
        <p className="package-contents">
          Inclui{' '}
          {promotion.items
            .map((i) => `${i.quantity} atendimento(s) de ${i.name}`)
            .join(' e ')}
          .
        </p>
      )}
      {active && (
        <PackageWizard
          key={selected}
          catalog={catalog}
          selection={
            promotion
              ? { promotionId: promotion.id }
              : { purchaseId: purchase!.id }
          }
          onBooked={(r) => {
            setResult(r)
            setSelected('')
            sessionStorage.removeItem('bookingPackage')
            setRevision((v) => v + 1)
            onBooked()
          }}
        />
      )}
      {result && (
        <section className="package-confirmation" role="status">
          <h3>Seus horários estão reservados</h3>
          <p>
            {result.package.title} · valor total {money(result.package.price)}.
            <br />
            {result.package.minimumPaymentPercent === null
              ? 'A equipe precisa configurar a condição de pagamento.'
              : `Pagamento mínimo para realizar: ${result.package.minimumPaymentPercent}% · ${money(result.package.minimumPayment)}.`}
            <br />
            Validade até {bookingDate(result.package.validUntil)}.
          </p>
          {result.appointments.map((a) => (
            <p key={a.key}>
              <strong>{a.name}</strong> · {a.employeeName}
              <br />
              {bookingDate(a.startsAt)} — {bookingDate(a.endsAt)}
              <br />
              {a.included
                ? 'Incluído no pacote'
                : `Adicional: ${money(a.price)} · sinal ${money(a.deposit)} até ${a.deadline ? bookingDate(a.deadline) : 'a confirmar'}`}
            </p>
          ))}
          <p>
            A realização dos procedimentos do pacote depende da confirmação do
            pagamento mínimo pela equipe. As utilizações restantes continuam no
            seu saldo.
          </p>
        </section>
      )}
      {!loading && !!purchases.length && (
        <details className="package-balance-summary">
          <summary>Resumo dos meus pacotes</summary>
          {purchases.map((p) => (
            <article key={p.id}>
              <h3>{p.title}</h3>
              <p>
                Validade: {bookingDate(p.validUntil)} ·{' '}
                {p.expired ? 'Encerrada' : 'Em vigor'}
              </p>
              <p>
                Total {money(p.price)} · pago {money(p.totalPaid)}.
              </p>
              <p>
                {Object.entries(
                  p.uses?.reduce<Record<string, number>>(
                    (v, u) => ({ ...v, [u.state]: (v[u.state] ?? 0) + 1 }),
                    {},
                  ) ?? {},
                ).map(([state, count]) => (
                  <span key={state}>
                    {count} {packageUseLabel(state)} ·{' '}
                  </span>
                ))}
              </p>
            </article>
          ))}
        </details>
      )}
    </section>
  )
}
