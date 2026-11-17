import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bookingRequest } from '../booking/bookingApi'
export function BirthdayNotice() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    const refresh = () =>
      bookingRequest<{ count: number }>('/social/birthdays/today', {
        signal: c.signal,
      })
        .then((d) => {
          if (!c.signal.aborted) setCount(d.count)
        })
        .catch(() => {
          if (!c.signal.aborted) setCount(0)
        })
    void refresh()
    const timer = setInterval(() => void refresh(), 60000)
    return () => {
      c.abort()
      clearInterval(timer)
    }
  }, [])
  return count > 0 ? (
    <Link
      className="birthday-notification"
      to="/dashboard/social/aniversariantes"
      role="status"
    >
      Hoje é dia de celebrar: {count}{' '}
      {count === 1 ? 'cliente faz' : 'clientes fazem'} aniversário. Ver
      aniversariantes →
    </Link>
  ) : null
}
