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
  const [form, setForm] = useState({ name: '', duration: '', price: '' })
  function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServices((current) => [
      ...current,
      {
        id: Date.now(),
        name: form.name,
        duration: Number(form.duration),
        price: Number(form.price),
        active: true,
      },
    ])
    setForm({ name: '', duration: '', price: '' })
    setShowForm(false)
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
          onClick={() => setShowForm(!showForm)}
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
            Adicionar
          </button>
        </form>
      )}
      <div className="service-grid">
        {services.map((service) => (
          <article className="service-card" key={service.id}>
            <div>
              <span className="service-kicker">Serviço</span>
              <h2>{service.name}</h2>
            </div>
            <strong>R$ {service.price.toFixed(2).replace('.', ',')}</strong>
            <p>{service.duration} minutos de atendimento</p>
            <button
              type="button"
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
              {service.active ? 'Disponível' : 'Indisponível'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default ServicesPage
