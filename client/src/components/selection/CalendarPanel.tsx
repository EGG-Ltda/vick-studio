import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { calendarDays, dateParts, localDay, pad, shiftDay, shiftMonth, withinBounds } from './temporal'

const monthNames = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month, 1))))
export function CalendarPanel({ value, min, max, onChoose, monthOnly = false, available }: { value: string; min?: string; max?: string; onChoose: (value: string) => void; monthOnly?: boolean; available?: (value: string) => boolean }) {
  const initial = value.slice(0, 10).length === 10 && dateParts(value.slice(0, 10)) ? value.slice(0, 10) : value.length === 7 ? value + '-01' : localDay()
  const seed = min && initial < min ? min.slice(0, 10).padEnd(10, '-01').slice(0, 10) : max && initial > max ? max.slice(0, 10) : initial
  const validSeed = dateParts(seed) ? seed : dateParts(seed + '-01') ? seed + '-01' : initial
  const [focus, setFocus] = useState(validSeed), [view, setView] = useState<'days' | 'months' | 'years'>(monthOnly ? 'months' : 'days')
  const root = useRef<HTMLDivElement>(null), moveFocus = useRef(false)
  const month = focus.slice(0, 7), year = Number(focus.slice(0, 4)), monthIndex = Number(focus.slice(5, 7)) - 1
  const days = calendarDays(month), startYear = Math.floor(year / 12) * 12
  const allowed = (day: string) => withinBounds(day, min?.slice(0, 10), max?.slice(0, 10)) && (!available || available(day))
  const monthAllowed = (candidate: string) => (!min || candidate >= min.slice(0, 7)) && (!max || candidate <= max.slice(0, 7))
  useLayoutEffect(() => { if (moveFocus.current) { root.current?.querySelector<HTMLButtonElement>('[data-calendar-focus="true"]')?.focus(); moveFocus.current = false } }, [focus, view])
  function move(target: string) { if (dateParts(target)) { moveFocus.current = true; setFocus(target) } }
  function keydown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    let target: string | undefined
    if (event.key === 'ArrowLeft') target = shiftDay(day, -1)
    if (event.key === 'ArrowRight') target = shiftDay(day, 1)
    if (event.key === 'ArrowUp') target = shiftDay(day, -7)
    if (event.key === 'ArrowDown') target = shiftDay(day, 7)
    if (event.key === 'Home') target = shiftDay(day, -dateParts(day)!.getUTCDay())
    if (event.key === 'End') target = shiftDay(day, 6 - dateParts(day)!.getUTCDay())
    if (event.key === 'PageUp') target = shiftMonth(day, event.shiftKey ? -12 : -1)
    if (event.key === 'PageDown') target = shiftMonth(day, event.shiftKey ? 12 : 1)
    if (target) { event.preventDefault(); move(target) }
  }
  function navigate(direction: number) { move(shiftMonth(focus, direction * (view === 'days' ? 1 : view === 'months' ? 12 : 144))) }
  return <div className="salon-calendar" ref={root}>
    <div className="salon-calendar-header">
      <button type="button" className="salon-calendar-nav" aria-label={view === 'days' ? 'Mês anterior' : 'Período anterior'} onClick={() => navigate(-1)} disabled={year <= 1 || (view === 'days' ? !!min && month <= min.slice(0,7) : view === 'months' ? !!min && year <= Number(min.slice(0,4)) : !!min && startYear <= Number(min.slice(0,4)))}>‹</button>
      <div className="salon-calendar-title" aria-live="polite"><button type="button" onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : monthOnly ? 'months' : 'days')} aria-label={view === 'days' ? 'Escolher mês e ano' : 'Escolher ano'}>{view === 'days' ? `${monthNames[monthIndex]} de ${year}` : view === 'months' ? year : `${Math.max(1, startYear)} – ${startYear + 11}`}</button></div>
      <button type="button" className="salon-calendar-nav" aria-label={view === 'days' ? 'Próximo mês' : 'Próximo período'} onClick={() => navigate(1)} disabled={year >= 9999 || (view === 'days' ? !!max && month >= max.slice(0,7) : view === 'months' ? !!max && year >= Number(max.slice(0,4)) : !!max && startYear + 11 >= Number(max.slice(0,4)))}>›</button>
    </div>
    {view === 'days' ? <>
      <div className="salon-calendar-grid" role="grid" aria-label={`${monthNames[monthIndex]} de ${year}`}>
        <div className="salon-calendar-week" role="row">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span role="columnheader" key={day} aria-label={day}>{day}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div className="salon-calendar-week" role="row" key={week}>{days.slice(week * 7, week * 7 + 7).map(day => <span role="gridcell" key={day} aria-selected={value.slice(0, 10) === day}>
          <button type="button" data-calendar-focus={day === focus} tabIndex={day === focus ? 0 : -1} aria-disabled={!allowed(day) || undefined} aria-current={day === localDay() ? 'date' : undefined} aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(dateParts(day)!)} className={`${day.slice(0, 7) !== month ? 'is-other-month ' : ''}${day === value.slice(0, 10) ? 'is-selected' : ''}`} onKeyDown={event => keydown(event, day)} onClick={() => { if (allowed(day)) onChoose(day) }}>{Number(day.slice(8))}</button>
        </span>)}</div>)}
      </div>
      <p className="salon-calendar-help">Use as setas para navegar e Enter para selecionar.</p>
    </> : <div className="salon-calendar-choices">
      {Array.from({ length: 12 }, (_, index) => {
        const candidate = view === 'months' ? `${String(year).padStart(4, '0')}-${pad(index + 1)}` : String(startYear + index).padStart(4, '0')
        const disabled = view === 'months' ? !monthAllowed(candidate) : Number(candidate) < 1 || Number(candidate) > 9999 || (!!min && candidate < min.slice(0, 4)) || (!!max && candidate > max.slice(0, 4))
        return <button type="button" key={candidate} disabled={disabled} className={(view === 'months' ? value.slice(0, 7) : value.slice(0, 4)) === candidate ? 'is-selected' : ''} onClick={() => {
          if (view === 'years') { setFocus(`${candidate}-${focus.slice(5, 7)}-01`); setView('months') }
          else if (monthOnly) onChoose(candidate)
          else { setFocus(candidate + '-01'); setView('days') }
        }}>{view === 'months' ? monthNames[index].slice(0, 3) : Number(candidate)}</button>
      })}
    </div>}
  </div>
}
