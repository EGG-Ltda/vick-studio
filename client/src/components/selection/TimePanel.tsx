import { useLayoutEffect, useRef } from 'react'
import { pad, temporalStepValid, withinBounds } from './temporal'
export function TimePanel({ value, min, max, step, onChoose }: { value: string; min?: string; max?: string; step?: string | number; onChoose: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [hour = '09', minute = '00'] = (value || '09:00').split(':')
  const seconds = Number(step ?? 60) < 60 && step !== 'any'
  const suffix = seconds ? ':' + (value.split(':')[2] ?? '00') : ''
  const valid = (candidate: string) => withinBounds(candidate, min, max) && temporalStepValid('time', candidate, min, step)
  useLayoutEffect(() => { root.current?.querySelectorAll('[aria-pressed="true"]').forEach(element => element.scrollIntoView({ block: 'nearest' })) }, [])
  return <div className="salon-time" ref={root}>
    <div className="salon-time-heading"><strong>Escolha o horário</strong><span>{hour}:{minute}{suffix}</span></div>
    <div className="salon-time-columns">
      <div role="group" aria-label="Horas"><span>Hora</span><div className="salon-time-scroll">{Array.from({ length: 24 }, (_, index) => {
        const h = pad(index), candidate = `${h}:${minute}${suffix}`
        const alternative = Array.from({ length: 60 }, (_, m) => `${h}:${pad(m)}${suffix}`).find(valid)
        return <button type="button" key={h} aria-pressed={h === hour} disabled={!alternative} onClick={() => onChoose(valid(candidate) ? candidate : alternative!)}>{h}</button>
      })}</div></div>
      <div role="group" aria-label="Minutos"><span>Minuto</span><div className="salon-time-scroll">{Array.from({ length: 60 }, (_, index) => { const m = pad(index), candidate = `${hour}:${m}${suffix}`; return <button type="button" key={m} aria-pressed={m === minute} disabled={!valid(candidate)} onClick={() => onChoose(candidate)}>{m}</button> })}</div></div>
      {seconds && <div role="group" aria-label="Segundos"><span>Segundo</span><div className="salon-time-scroll">{Array.from({ length: 60 }, (_, index) => { const s = pad(index), candidate = `${hour}:${minute}:${s}`; return <button type="button" key={s} aria-pressed={s === value.split(':')[2]} disabled={!valid(candidate)} onClick={() => onChoose(candidate)}>{s}</button> })}</div></div>}
    </div>
  </div>
}
