import { useState } from 'react'
import type { FormEvent } from 'react'

type Service = {
  id: number
  name: string
  duration: number
  price: number
  active: boolean
}
const initialServices: Service[] = [
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

function ServicesPage() {
  const [services, setServices] = useState(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [hideDisabled, setHideDisabled] = useState(false)
  const [form, setForm] = useState({ name: '', duration: '', price: '' })
  function closeForm() {
    setForm({ name: '', duration: '', price: '' })
    setEditingId(null)
    setShowForm(false)
  }
  function editService(service: Service) {
    setEditingId(service.id)
    setForm({ name: service.name, duration: String(service.duration), price: String(service.price) })
    setShowForm(true)
  }
  function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) return
    if (editingId !== null) {
      setServices((current) => current.map((service) => service.id === editingId
        ? { ...service, name: form.name.trim(), duration: Number(form.duration), price: Number(form.price) }
        : service))
      closeForm()
      return
    }
    setServices((current) => [
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
        <form className="user-form" onSubmit={addService}>
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
      <label className="service-filter">
        <input type="checkbox" checked={hideDisabled} onChange={(event) => setHideDisabled(event.target.checked)} />
        Esconder serviços desabilitados
      </label>
      {services.filter((service) => !hideDisabled || service.active).length === 0 && (
        <p role="status">Nenhum serviço disponível.</p>
      )}
      <div className="service-grid">
        {services.filter((service) => !hideDisabled || service.active).map((service) => (
          <article className="service-card" key={service.id}>
            <div>
              <span className="service-kicker">Serviço</span>
              <h2>{service.name}</h2>
            </div>
            <strong>R$ {service.price.toFixed(2).replace('.', ',')}</strong>
            <p>{service.duration} minutos de atendimento</p>
            <span className={`status-tag ${service.active ? 'status-active' : 'status-inactive'}`}>
              {service.active ? 'Disponível' : 'Indisponível'}
            </span>
            <div className="service-card-actions">
            <button type="button" onClick={() => editService(service)} aria-label={`Editar ${service.name}`}>Editar</button>
            <button
              type="button"
              aria-label={`${service.active ? 'Desabilitar' : 'Habilitar'} ${service.name}`}
              onClick={() =>
                setServices((current) =>
                  current.map((item) =>
                    item.id === service.id
                      ? { ...item, active: !item.active }
                      : item,
                  ),
                )
              }
            >
              {service.active ? 'Desabilitar' : 'Habilitar'}
            </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default ServicesPage
