import { useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentPropsWithRef } from 'react'
import { SelectionPopover } from './SelectionPopover'
import { CalendarPanel } from './CalendarPanel'
import { TimePanel } from './TimePanel'
import { accessibleName, commitNative } from './nativeBridge'
import { dateParts, localDay, parseTemporal, temporalDisplay, temporalStepValid, withinBounds } from './temporal'
import type { TemporalType } from './temporal'

type InputProps = ComponentPropsWithRef<'input'>
export function SalonInput(props: InputProps) {
  if (['date', 'month', 'time', 'datetime-local'].includes(props.type ?? '')) return <TemporalInput {...props} type={props.type as TemporalType} />
  if (props.type === 'checkbox' || props.type === 'radio') return <input {...props} className={`salon-choice ${props.className ?? ''}`} />
  return <input {...props} />
}

function TemporalInput({ type, value, defaultValue, id: providedId, className = '', onChange, onInvalid, ref: forwardedRef, ...props }: InputProps & { type: TemporalType }) {
  const [popup, setPopup] = useState<{label: string; host: HTMLElement} | null>(null)
  const generated = useId(), id = providedId ?? `salon-date-${generated}`, popoverId = `${id}-picker`
  const native = useRef<HTMLInputElement>(null), field = useRef<HTMLInputElement>(null), anchor = useRef<HTMLSpanElement>(null), icon = useRef<HTMLButtonElement>(null)
  useImperativeHandle(forwardedRef, () => field.current!, [])
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? '')), [draft, setDraft] = useState({ source: String(value ?? defaultValue ?? ''), text: temporalDisplay(type, String(value ?? defaultValue ?? '')) }), [open, setOpen] = useState(false), [invalid, setInvalid] = useState(false)
  const canonical = String(value ?? uncontrolled), display = draft.source === canonical ? draft.text : temporalDisplay(type, canonical)
  const min = props.min === undefined ? undefined : String(props.min), max = props.max === undefined ? undefined : String(props.max)
  const parsed = parseTemporal(type, display)
  const placeholder = type === 'date' ? 'dd/mm/aaaa' : type === 'month' ? 'mm/aaaa' : type === 'time' ? 'hh:mm' : 'dd/mm/aaaa hh:mm'
  const validityMessage = parsed === null ? `Informe ${type === 'time' ? 'um horário' : 'uma data'} no formato ${placeholder}.` : parsed && !withinBounds(parsed, min, max) ? `Escolha um valor${min ? ` a partir de ${temporalDisplay(type, min)}` : ''}${max ? ` até ${temporalDisplay(type, max)}` : ''}.` : parsed && !temporalStepValid(type, parsed, min, props.step) ? 'Escolha um valor no intervalo permitido.' : ''
  useLayoutEffect(() => {
    native.current?.setCustomValidity(validityMessage)
    field.current?.setCustomValidity(validityMessage)
    const name = accessibleName(native.current)
    if (icon.current) icon.current.setAttribute('aria-label', `${type === 'time' ? 'Escolher horário' : type === 'month' ? 'Escolher mês' : 'Abrir calendário'}${name ? ': ' + name : ''}`)
  })
  function close(restore = false) { setOpen(false); if (restore) field.current?.focus() }
  function show() {
    if (field.current?.matches(':disabled') || props.readOnly) return
    const name = accessibleName(native.current)
    setPopup({label: `${type === 'time' ? 'Selecionar horário' : type === 'month' ? 'Selecionar mês' : 'Selecionar data'}${name ? ': ' + name : ''}`, host: anchor.current?.closest('dialog') ?? document.body})
    setOpen(true)
    requestAnimationFrame(() => {
      const panel = document.getElementById(popoverId)
      panel?.querySelector<HTMLElement>(type === 'time' ? '[aria-pressed="true"]' : '[data-calendar-focus="true"], .salon-calendar-choices button.is-selected, .salon-calendar-choices button:not(:disabled)')?.focus()
    })
  }
  function commit(next: string, finish = false) {
    if (!native.current || field.current?.matches(':disabled')) return
    if (next && (!withinBounds(next, min, max) || !temporalStepValid(type, next, min, props.step))) return
    setDraft({ source: next, text: temporalDisplay(type, next) }); setInvalid(false)
    native.current.setCustomValidity(''); field.current?.setCustomValidity('')
    commitNative(native.current, next)
    if (finish) close(true)
  }
  function chooseDay(day: string) {
    if (type !== 'datetime-local') { commit(day, true); return }
    let time = canonical.slice(11) || (min?.slice(0, 10) === day ? min.slice(11) : '09:00')
    if (max?.slice(0, 10) === day && `${day}T${time}` > max) time = max.slice(11)
    commit(`${day}T${time}`)
  }
  const today = type === 'month' ? localDay().slice(0, 7) : type === 'datetime-local' ? `${localDay()}T${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` : localDay()
  return <span className={`salon-selection salon-temporal ${className}`} ref={anchor}>
    <input {...props} ref={field} id={id} type="text" name={undefined} value={display} defaultValue={undefined} className="salon-temporal-text" placeholder={props.placeholder ?? placeholder} aria-invalid={invalid || props['aria-invalid'] || undefined} aria-describedby={[props['aria-describedby'], invalid && validityMessage ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} autoComplete={props.autoComplete ?? 'off'} onKeyDown={event => { props.onKeyDown?.(event); if (!event.defaultPrevented && (event.key === 'ArrowDown' || event.key === 'F4')) { event.preventDefault(); show() } }} onBlur={event => { props.onBlur?.(event); if (validityMessage) setInvalid(true) }} onChange={event => {
      const text = event.target.value, next = parseTemporal(type, text)
      setDraft({ source: canonical, text }); setInvalid(false)
      if (next !== null && native.current) commitNative(native.current, next)
    }} onInvalid={event => { event.preventDefault(); setInvalid(true); field.current?.focus() }} />
    <button ref={icon} type="button" className="salon-temporal-open" disabled={props.disabled || props.readOnly} aria-expanded={open} aria-controls={popoverId} aria-haspopup="dialog" onClick={() => open ? close() : show()}>
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">{type === 'time' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2" /></>}</svg>
    </button>
    <input {...props} autoFocus={false} ref={native} id={`${id}-native`} data-salon-label={providedId} type={type} className="salon-selection-native" value={value} defaultValue={defaultValue} tabIndex={-1} aria-hidden="true" onChange={event => { setUncontrolled(event.target.value); onChange?.(event) }} onInvalid={event => { event.preventDefault(); setInvalid(true); field.current?.focus(); onInvalid?.(event) }} />
    {invalid && validityMessage && <span id={`${id}-error`} className="salon-selection-error" role="alert">{validityMessage}</span>}
    {open && popup && <SelectionPopover id={popoverId} anchor={anchor} host={popup.host} onClose={close} label={popup.label} className="salon-temporal-popover">
      {type !== 'time' && <CalendarPanel value={canonical} min={min} max={max} monthOnly={type === 'month'} available={type === 'datetime-local' ? undefined : day => temporalStepValid(type, day, min, props.step)} onChoose={chooseDay} />}
      {(type === 'time' || type === 'datetime-local') && <TimePanel value={type === 'time' ? canonical : canonical.slice(11)} min={type === 'time' ? min : min?.slice(0, 10) === canonical.slice(0, 10) ? min.slice(11) : undefined} max={type === 'time' ? max : max?.slice(0, 10) === canonical.slice(0, 10) ? max.slice(11) : undefined} step={props.step} onChoose={time => commit(type === 'time' ? time : `${dateParts(canonical.slice(0, 10)) ? canonical.slice(0, 10) : localDay()}T${time}`)} />}
      <div className="salon-picker-footer"><button type="button" onClick={() => commit('', true)} disabled={props.required}>Limpar</button><span />{type !== 'time' && <button type="button" disabled={!withinBounds(today, min, max) || !temporalStepValid(type, today, min, props.step)} onClick={() => commit(today, true)}>{type === 'datetime-local' ? 'Agora' : type === 'month' ? 'Este mês' : 'Hoje'}</button>}<button type="button" className="salon-picker-done" onClick={() => close(true)}>Concluir</button></div>
    </SelectionPopover>}
  </span>
}
