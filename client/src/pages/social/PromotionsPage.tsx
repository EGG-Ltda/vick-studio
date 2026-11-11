import { allowed } from '../../core/auth/permissions'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { SalonModal } from '../../components/SalonModal'
import { bookingRequest, money } from '../booking/bookingApi'
import type { BookingCatalog } from '../booking/bookingApi'
import type { Promotion } from './socialApi'
import { dateOnly } from './socialApi'
import '../booking/booking.css'
import './social.css'
type Form = {
  title: string
  description: string
  conditions: string
  artId: number
  altText: string
  startsOn: string
  endsOn: string
  active: boolean
  price: string
  items: { treatmentId: number; quantity: number }[]
}
const empty: Form = {
  title: '',
  description: '',
  conditions: '',
  artId: 0,
  altText: '',
  startsOn: '',
  endsOn: '',
  active: false,
  price: '',
  items: [],
}
export default function PromotionsPage() {
  const { user } = useAuth()
  const canView = allowed(user, 'promotions.view')
  const [items, setItems] = useState<Promotion[]>([]),
    [catalog, setCatalog] = useState<BookingCatalog | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<number | null | false>(false),
    [form, setForm] = useState<Form>(empty),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState('')
  useEffect(() => {
    if (!canView) return
    const c = new AbortController()
    Promise.all([
      bookingRequest<Promotion[]>('/social/promotions', { signal: c.signal }),
      bookingRequest<BookingCatalog>('/booking/catalog', { signal: c.signal }),
    ])
      .then(([p, b]) => {
        if (!c.signal.aborted) {
          setItems(p)
          setCatalog(b)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [revision, canView])
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setFormError('')
    try {
      if (
        file.size > 3 * 1024 * 1024 ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw Error('Selecione PNG, JPEG ou WebP de até 3 MB.')
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(Error('Não foi possível ler a imagem.'))
        reader.readAsDataURL(file)
      })
      const result = await bookingRequest<{ id: number }>('/social/art', {
        method: 'POST',
        body: JSON.stringify({ mime: file.type, base64 }),
      })
      setForm((f) => ({ ...f, artId: result.id }))
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unable to upload artwork.')
    } finally {
      setBusy(false)
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await bookingRequest(
        `/social/promotions${editing ? '/' + editing : ''}`,
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({ ...form, price: Number(form.price) }),
        },
      )
      setEditing(false)
      setLoading(true)
      setError('')
      setRevision((r) => r + 1)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unable to save promotion.')
    } finally {
      setBusy(false)
    }
  }
  if (!canView)
    return <p>Somente ADMIN e MASTER podem gerenciar promoções e pacotes.</p>
  return (
    <section className="dashboard-view social-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">
            Social · experiências para compartilhar
          </span>
          <h1>Promoções e pacotes</h1>
          <p>
            Campanhas na home e procedimentos combinados em uma única aquisição.
          </p>
        </div>
        {allowed(user, 'promotions.manage') && (
          <button
            className="primary-button"
            onClick={() => {
              setForm(empty)
              setFormError('')
              setEditing(null)
            }}
          >
            Criar promoção
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando campanhas…</p>
      ) : (
        <div className="social-grid">
          {items.map((p) => (
            <article key={p.id} className="social-card promo-card">
              <img
                src={`/api/public/promotion-art/${p.artId}`}
                alt={p.altText}
              />
              <div>
                <span className="salon-eyebrow">
                  {p.active ? 'Ativa' : 'Inativa'} · {dateOnly(p.startsOn)} a{' '}
                  {dateOnly(p.endsOn)}
                </span>
                <h2>{p.title}</h2>
                <p>{p.description}</p>
                <strong>{money(p.price)}</strong>
                <p>
                  {p.items.map((i) => `${i.quantity}× ${i.name}`).join(' + ')}
                </p>
                {allowed(user, 'promotions.manage') && (
                  <button
                    onClick={() => {
                      setForm({ ...p, price: String(p.price) })
                      setFormError('')
                      setEditing(p.id)
                    }}
                  >
                    Editar campanha
                  </button>
                )}
              </div>
            </article>
          ))}
          {!items.length && (
            <p>Nenhuma promoção cadastrada. Crie a primeira campanha.</p>
          )}
        </div>
      )}
      {editing !== false && (
        <SalonModal
          title={editing ? 'Editar promoção' : 'Nova promoção e pacote'}
          description="O período da campanha é independente da validade de utilização do pacote."
          busy={busy}
          onClose={() => setEditing(false)}
        >
          <form className="booking-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Título
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                Descrição
                <textarea
                  required
                  minLength={3}
                  maxLength={3000}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Arte da promoção (PNG, JPEG ou WebP, até 3 MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              {form.artId > 0 && (
                <img
                  className="social-art-preview"
                  src={`/api/public/promotion-art/${form.artId}`}
                  alt={form.altText || 'Prévia da arte'}
                />
              )}
              <label>
                Texto alternativo da imagem
                <input
                  required
                  minLength={3}
                  maxLength={255}
                  value={form.altText}
                  onChange={(e) =>
                    setForm({ ...form, altText: e.target.value })
                  }
                />
              </label>
              <div className="social-grid">
                <label>
                  Início da divulgação
                  <input
                    required
                    type="date"
                    value={form.startsOn}
                    onChange={(e) =>
                      setForm({ ...form, startsOn: e.target.value })
                    }
                  />
                </label>
                <label>
                  Fim da divulgação
                  <input
                    required
                    type="date"
                    min={form.startsOn}
                    value={form.endsOn}
                    onChange={(e) =>
                      setForm({ ...form, endsOn: e.target.value })
                    }
                  />
                </label>
              </div>
              <h3>Procedimentos incluídos</h3>
              {catalog?.treatments.map((t) => {
                const i = form.items.find((i) => i.treatmentId === t.id)
                return (
                  <div className="social-procedure" key={t.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!i}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            items: e.target.checked
                              ? [
                                  ...form.items,
                                  { treatmentId: t.id, quantity: 1 },
                                ]
                              : form.items.filter(
                                  (i) => i.treatmentId !== t.id,
                                ),
                          })
                        }
                      />
                      {t.name}
                    </label>
                    {i && (
                      <label>
                        Quantidade
                        <input
                          aria-label={`Quantidade de ${t.name}`}
                          type="number"
                          min="1"
                          max="10"
                          required
                          value={i.quantity}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              items: form.items.map((i) =>
                                i.treatmentId === t.id
                                  ? { ...i, quantity: Number(e.target.value) }
                                  : i,
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                )
              })}
              <label>
                Preço total do pacote (R$)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="99999.99"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label>
                Condições de utilização
                <textarea
                  required
                  minLength={3}
                  maxLength={3000}
                  value={form.conditions}
                  onChange={(e) =>
                    setForm({ ...form, conditions: e.target.value })
                  }
                />
              </label>
              <label className="social-check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Ativar campanha (aparece na home somente durante a divulgação)
              </label>
              <p>
                Todos os horários são escolhidos na aquisição. Sem sinal para
                pacotes. Validade padrão:{' '}
                {catalog?.settings.packageValidityMonths ?? 1} mês(es),
                configurável em Configurações da agenda.
              </p>
            </fieldset>
            {formError && (
              <p role="alert" className="booking-error">
                {formError}
              </p>
            )}
            <button
              className="primary-button"
              disabled={busy || !form.artId || !form.items.length}
            >
              {busy ? 'Salvando…' : 'Salvar promoção'}
            </button>
          </form>
        </SalonModal>
      )}
    </section>
  )
}
