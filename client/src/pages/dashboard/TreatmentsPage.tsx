import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'

import { listTreatments, saveTreatment } from '../../core/api/treatments'
import type { Treatment } from '../../core/api/treatments'

function TreatmentsPage() {
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    listTreatments(false, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setTreatments(items)
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [hideDisabled, setHideDisabled] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: '',
    price: '',
  })
  function closeForm() {
    if (saving) return
    setError('')
    setForm({ name: '', description: '', duration: '', price: '' })
    setEditingId(null)
    setShowForm(false)
  }
  function editTreatment(treatment: Treatment) {
    setError('')
    setEditingId(treatment.id)
    setForm({
      name: treatment.name,
      description: treatment.description,
      duration: String(treatment.durationMinutes),
      price: String(treatment.price),
    })
    setShowForm(true)
  }
  async function addTreatment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const saved = await saveTreatment(
        {
          name: form.name.trim(),
          description: form.description.trim(),
          durationMinutes: Number(form.duration),
          price: Number(form.price),
          isActive:
            treatments.find((item) => item.id === editingId)?.isActive ?? true,
        },
        editingId ?? undefined,
      )
      setTreatments((current) =>
        editingId === null
          ? [...current, saved]
          : current.map((item) => (item.id === saved.id ? saved : item)),
      )
      setForm({ name: '', description: '', duration: '', price: '' })
      setEditingId(null)
      setShowForm(false)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o serviço.',
      )
    } finally {
      setSaving(false)
    }
  }
  async function toggleTreatment(treatment: Treatment) {
    setSaving(true)
    setError('')
    try {
      const saved = await saveTreatment(
        { ...treatment, isActive: !treatment.isActive },
        treatment.id,
      )
      setTreatments((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar o serviço.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Cuidado em cada experiência</span>
          <h1>Serviços</h1>
          <p>Configure os serviços oferecidos pelo estúdio.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={saving}
          onClick={() => {
            setError('')
            setShowForm(true)
          }}
        >
          <span aria-hidden="true">＋</span> Novo serviço
        </button>
      </header>
      {error && !showForm && <p role="alert">{error}</p>}
      {loading && <p role="status">Carregando serviços…</p>}
      {showForm && (
        <SalonModal
          title={editingId !== null ? 'Editar serviço' : 'Novo serviço'}
          description="Personalize os cuidados oferecidos pelo seu estúdio."
          onClose={closeForm}
          busy={saving}
        >
          <form className="user-form" onSubmit={addTreatment}>
            <fieldset disabled={saving} className="treatment-form-fields">
              <label>
                Nome
                <input
                  autoFocus
                  maxLength={255}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Descrição
                <textarea
                  required
                  maxLength={1023}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <label>
                Duração (min)
                <input
                  type="number"
                  min="1"
                  value={form.duration}
                  onChange={(event) =>
                    setForm({ ...form, duration: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Preço
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                  required
                />
              </label>
            </fieldset>
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={closeForm} disabled={saving}>
                Cancelar
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {editingId !== null ? 'Salvar alterações' : 'Cadastrar serviço'}
              </button>
            </div>
          </form>
        </SalonModal>
      )}
      <div className="list-toolbar">
        <div>
          <h2>Catálogo de serviços</h2>
          <span>Experiências pensadas para cada cliente.</span>
        </div>
        <label className="treatment-filter">
          <input
            type="checkbox"
            checked={hideDisabled}
            onChange={(event) => setHideDisabled(event.target.checked)}
          />
          Esconder serviços desabilitados
        </label>
      </div>
      {!loading &&
        !error &&
        treatments.filter((treatment) => !hideDisabled || treatment.isActive)
          .length === 0 && <p role="status">Nenhum serviço disponível.</p>}
      <div className="treatment-grid">
        {treatments
          .filter((treatment) => !hideDisabled || treatment.isActive)
          .map((treatment) => (
            <article className="treatment-card" key={treatment.id}>
              <div>
                <span className="treatment-kicker">Serviço</span>
                <h2>{treatment.name}</h2>
              </div>
              <strong>R$ {treatment.price.toFixed(2).replace('.', ',')}</strong>
              <p>{treatment.durationMinutes} minutos de atendimento</p>
              <span
                className={`status-tag ${treatment.isActive ? 'status-active' : 'status-inactive'}`}
              >
                {treatment.isActive ? 'Disponível' : 'Indisponível'}
              </span>
              <div className="treatment-card-actions">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => editTreatment(treatment)}
                  aria-label={`Editar ${treatment.name}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  aria-label={`${treatment.isActive ? 'Desabilitar' : 'Habilitar'} ${treatment.name}`}
                  disabled={saving}
                  onClick={() => void toggleTreatment(treatment)}
                >
                  {treatment.isActive ? 'Desabilitar' : 'Habilitar'}
                </button>
              </div>
            </article>
          ))}
      </div>
    </section>
  )
}

export default TreatmentsPage
