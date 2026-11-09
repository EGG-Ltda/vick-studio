import { useState } from 'react'
import type { FormEvent } from 'react'

type Treatment = {
  id: number
  name: string
  duration: number
  price: number
  active: boolean
}
const initialTreatments: Treatment[] = [
  { id: 1, name: 'Corte feminino', duration: 60, price: 85, active: true },
  { id: 2, name: 'Manicure', duration: 45, price: 55, active: true },
  {
    id: 3,
    name: 'Design de sobrancelhas',
    duration: 30,
    price: 40,
    active: true,
  },
]

function TreatmentsPage() {
  const [treatments, setTreatments] = useState(initialTreatments)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [hideDisabled, setHideDisabled] = useState(false)
  const [form, setForm] = useState({ name: '', duration: '', price: '' })
  function closeForm() {
    setForm({ name: '', duration: '', price: '' })
    setEditingId(null)
    setShowForm(false)
  }
  function editTreatment(treatment: Treatment) {
    setEditingId(treatment.id)
    setForm({ name: treatment.name, duration: String(treatment.duration), price: String(treatment.price) })
    setShowForm(true)
  }
  function addTreatment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) return
    if (editingId !== null) {
      setTreatments((current) => current.map((treatment) => treatment.id === editingId
        ? { ...treatment, name: form.name.trim(), duration: Number(form.duration), price: Number(form.price) }
        : treatment))
      closeForm()
      return
    }
    setTreatments((current) => [
      ...current,
      {
        id: Date.now(),
        name: form.name.trim(),
        duration: Number(form.duration),
        price: Number(form.price),
        active: true,
      },
    ])
    closeForm()
  }
  return (
    <section className="dashboard-view">
      <header className="dashboard-view-header">
        <div>
          <h1>Serviços</h1>
          <p>Configure os serviços oferecidos pelo estúdio.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => showForm ? closeForm() : setShowForm(true)}
        >
          {showForm ? 'Cancelar' : 'Novo serviço'}
        </button>
      </header>
      {showForm && (
        <form className="user-form" onSubmit={addTreatment}>
          <label>
            Nome
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
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
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) =>
                setForm({ ...form, price: event.target.value })
              }
              required
            />
          </label>
          <button className="primary-button" type="submit">
            {editingId !== null ? 'Salvar alterações' : 'Adicionar'}
          </button>
        </form>
      )}
      <label className="treatment-filter">
        <input type="checkbox" checked={hideDisabled} onChange={(event) => setHideDisabled(event.target.checked)} />
        Esconder serviços desabilitados
      </label>
      {treatments.filter((treatment) => !hideDisabled || treatment.active).length === 0 && (
        <p role="status">Nenhum serviço disponível.</p>
      )}
      <div className="treatment-grid">
        {treatments.filter((treatment) => !hideDisabled || treatment.active).map((treatment) => (
          <article className="treatment-card" key={treatment.id}>
            <div>
              <span className="treatment-kicker">Serviço</span>
              <h2>{treatment.name}</h2>
            </div>
            <strong>R$ {treatment.price.toFixed(2).replace('.', ',')}</strong>
            <p>{treatment.duration} minutos de atendimento</p>
            <span className={`status-tag ${treatment.active ? 'status-active' : 'status-inactive'}`}>
              {treatment.active ? 'Disponível' : 'Indisponível'}
            </span>
            <div className="treatment-card-actions">
            <button type="button" onClick={() => editTreatment(treatment)} aria-label={`Editar ${treatment.name}`}>Editar</button>
            <button
              type="button"
              aria-label={`${treatment.active ? 'Desabilitar' : 'Habilitar'} ${treatment.name}`}
              onClick={() =>
                setTreatments((current) =>
                  current.map((item) =>
                    item.id === treatment.id
                      ? { ...item, active: !item.active }
                      : item,
                  ),
                )
              }
            >
              {treatment.active ? 'Desabilitar' : 'Habilitar'}
            </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default TreatmentsPage
