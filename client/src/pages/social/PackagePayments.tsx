import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { bookingRequest, money, bookingDate } from '../booking/bookingApi'
import type { PackagePurchase } from './socialApi'
export function PackagePayments({
  id,
  onChanged,
  onBusyChange,
}: {
  id: number
  onChanged: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const { user } = useAuth()
  const [data, setData] = useState<PackagePurchase | null>(null),
    [methods, setMethods] = useState<{ id: number; name: string }[]>([]),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    amount: '',
    methodId: '',
    description: 'Pagamento do pacote',
    refundOf: '',
  })
  const request = useRef<{ body: string; key: string } | null>(null)
  useEffect(() => {
    if (!user?.canManagePasswords) return
    const c = new AbortController()
    Promise.all([
      bookingRequest<PackagePurchase>(`/social/packages/${id}`, {
        signal: c.signal,
      }),
      bookingRequest<{ id: number; name: string }[]>(
        '/social/payment-methods',
        { signal: c.signal },
      ),
    ])
      .then(([p, m]) => {
        if (!c.signal.aborted) {
          setData(p)
          setMethods(m)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [id, revision, user?.canManagePasswords])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      const body = form.refundOf
        ? { amount: Number(form.amount), reason: form.description }
        : {
            amount: Number(form.amount),
            methodId: Number(form.methodId),
            description: form.description,
          }
      const text = JSON.stringify({ ...body, refundOf: form.refundOf })
      if (request.current?.body !== text)
        request.current = { body: text, key: crypto.randomUUID() }
      await bookingRequest(
        `/social/packages/${id}/${form.refundOf ? 'refunds/' + form.refundOf : 'payments'}`,
        {
          method: 'POST',
          body: JSON.stringify({ ...body, requestKey: request.current.key }),
        },
      )
      setNotice(
        'Lançamento do pacote registrado e distribuído entre as comandas.',
      )
      setForm({ ...form, amount: '' })
      request.current = null
      setRevision((r) => r + 1)
      onChanged()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to record package receipt.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  if (!user?.canManagePasswords)
    return (
      <p>
        Os recebimentos do pacote são registrados por ADMIN ou MASTER. A comanda
        mostra somente o valor distribuído para este atendimento.
      </p>
    )
  return (
    <section className="package-panel">
      <h2>Recebimentos do pacote #{id}</h2>
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && <p role="status">Consultando pacote…</p>}
      {data && (
        <>
          <p>
            {data.title} · Valor {money(data.price)} · Pago{' '}
            {money(data.totalPaid)} · Saldo{' '}
            {money((data.price ?? 0) - (data.totalPaid ?? 0))}
          </p>
          <p>
            Validade até {bookingDate(data.validUntil)}. Registre o pagamento
            uma única vez aqui. Na comanda individual, registre apenas consumos
            extras.
          </p>
          <form className="booking-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>
                Tipo de lançamento
                <select
                  value={form.refundOf}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      refundOf: e.target.value,
                      description: e.target.value
                        ? 'Estorno do pacote'
                        : 'Pagamento do pacote',
                    })
                  }
                >
                  <option value="">Recebimento do pacote</option>
                  {data.receipts
                    ?.filter(
                      (r) =>
                        r.kind === 'payment' &&
                        r.amount >
                          (data.receipts ?? [])
                            .filter((f) => f.refundOf === r.id)
                            .reduce((s, f) => s + f.amount, 0),
                    )
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        Estornar recebimento #{r.id} · {money(r.amount)}
                      </option>
                    ))}
                </select>
              </label>
              {!form.refundOf && (
                <label>
                  Forma de pagamento
                  <select
                    required
                    value={form.methodId}
                    onChange={(e) =>
                      setForm({ ...form, methodId: e.target.value })
                    }
                  >
                    <option value="">Selecione</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Valor (R$)
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  max="99999.99"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </label>
              <label>
                {form.refundOf ? 'Motivo do estorno' : 'Descrição'}
                <input
                  required
                  minLength={3}
                  maxLength={1000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
            </fieldset>
            <button disabled={busy} className="primary-button">
              {busy ? 'Registrando…' : 'Registrar lançamento do pacote'}
            </button>
          </form>
          {data.receipts?.map((r) => (
            <p key={r.id}>
              #{r.id} · {r.kind === 'refund' ? 'Estorno' : 'Recebimento'}{' '}
              {money(r.amount)} · {r.method} · {bookingDate(r.createdAt)}
            </p>
          ))}
        </>
      )}
    </section>
  )
}
