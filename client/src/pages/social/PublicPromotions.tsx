import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bookingRequest, money } from '../booking/bookingApi'
import { dateOnly } from './socialApi'
import type { Promotion } from './socialApi'
import './social.css'
export function PublicPromotions() {
  const [items, setItems] = useState<Promotion[]>([])
  useEffect(() => {
    const c = new AbortController()
    const refresh = () =>
      bookingRequest<{ items: Promotion[] }>('/public/promotions', {
        signal: c.signal,
      })
        .then((d) => {
          if (!c.signal.aborted) setItems(d.items)
        })
        .catch(() => {})
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => {
      c.abort()
      clearInterval(timer)
    }
  }, [])
  if (!items.length) return null
  return (
    <section className="public-promotions" aria-labelledby="promotions-title">
      <h2 id="promotions-title">Experiências para florescer</h2>
      <div className="social-grid">
        {items.map((p) => (
          <article className="social-card promo-card" key={p.id}>
            <img
              loading="lazy"
              src={`/api/public/promotion-art/${p.artId}`}
              alt={p.altText}
            />
            <div>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              <p>
                {p.items.map((i) => `${i.quantity}× ${i.name}`).join(' + ')}
              </p>
              <strong>{money(p.price)}</strong>
              <p>
                Oferta de {dateOnly(p.startsOn)} a {dateOnly(p.endsOn)}
              </p>
              <p>{p.conditions}</p>
              <Link to={`/agendar?pacote=${p.id}`}>Escolher este pacote →</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
