import { Children, isValidElement, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, SelectHTMLAttributes, KeyboardEvent } from 'react'
import { SelectionPopover } from './SelectionPopover'
import { accessibleName, commitNative } from './nativeBridge'

type Option = { value: string; label: string; disabled: boolean; group?: string }
function text(node: ReactNode): string { return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join('') }
function optionsFrom(children: ReactNode, group?: string, disabled = false): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; label?: string; children?: ReactNode; disabled?: boolean }>(child)) return []
    if (child.type === 'option') return [{ value: String(child.props.value ?? text(child.props.children)), label: child.props.label ?? text(child.props.children), disabled: disabled || !!child.props.disabled, group }]
    return optionsFrom(child.props.children, child.type === 'optgroup' ? child.props.label : group, disabled || !!child.props.disabled)
  })
}
export function SalonSelect({ children, value, defaultValue, className = '', id: providedId, onChange, onInvalid, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId(), id = providedId ?? `salon-select-${generated}`
  const native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null), search = useRef({ value: '', at: 0 })
  const [popup, setPopup] = useState<{label: string; host: HTMLElement} | null>(null)
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [invalid, setInvalid] = useState(false), [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
  const options = useMemo(() => optionsFrom(children), [children])
  const current = String(value ?? uncontrolled)
  const selected = options.find(option => option.value === current) ?? options[0]
  const listId = `${id}-options`
  useLayoutEffect(() => {
    const button = trigger.current, control = native.current
    if (!button || !control) return
    if (!props['aria-labelledby']) button.setAttribute('aria-label', accessibleName(control) || 'Selecionar opção')
  })
  function openAt(index: number) { setActive(index); setPopup({label: accessibleName(native.current) || 'Opções disponíveis', host: trigger.current?.closest('dialog') ?? document.body}); setOpen(true) }
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus() }
  function show(last = false) {
    if (trigger.current?.matches(':disabled')) return
    const selectedIndex = options.findIndex(option => option.value === current && !option.disabled)
    const initial = last ? options.findLastIndex(option => !option.disabled) : selectedIndex >= 0 ? selectedIndex : options.findIndex(option => !option.disabled)
    openAt(Math.max(0, initial))
  }
  function choose(index: number) {
    if (!options[index] || options[index].disabled || !native.current || trigger.current?.matches(':disabled')) return
    setInvalid(false); commitNative(native.current, options[index].value); close(true)
  }
  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { show(event.key === 'ArrowUp'); return }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      let index = active
      for (let i = 0; i < options.length; i++) { index = (index + direction + options.length) % options.length; if (!options[index].disabled) break }
      setActive(index)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); if (!open) show(event.key === 'End')
      else setActive(event.key === 'Home' ? options.findIndex(option => !option.disabled) : options.findLastIndex(option => !option.disabled))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) choose(active); else show()
    } else if (event.key === 'Tab') close()
    else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      const now = Date.now(), term = (now - search.current.at > 700 ? '' : search.current.value) + event.key.toLocaleLowerCase('pt-BR')
      search.current = { value: term, at: now }
      const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
      const index = options.findIndex(option => !option.disabled && normalize(option.label).startsWith(normalize(term)))
      if (index >= 0) { setActive(index); if (!open) openAt(index) }
    }
  }
  useLayoutEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [open, active, listId])
  return <span className={`salon-selection salon-select ${className}`}>
    <select {...props} autoFocus={false} ref={native} id={`${id}-native`} data-salon-label={providedId} className="salon-selection-native" tabIndex={-1} aria-hidden="true" value={value} defaultValue={defaultValue} onChange={event => { setUncontrolled(event.target.value); setInvalid(false); onChange?.(event) }} onInvalid={event => { event.preventDefault(); setInvalid(true); trigger.current?.focus(); onInvalid?.(event) }}>{children}</select>
    <button ref={trigger} id={id} type="button" className="salon-selection-trigger" role="combobox" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" aria-activedescendant={open ? `${listId}-${active}` : undefined} aria-required={props.required || undefined} aria-invalid={invalid || props['aria-invalid'] || undefined} aria-describedby={props['aria-describedby']} aria-labelledby={props['aria-labelledby']} disabled={props.disabled} autoFocus={props.autoFocus} onKeyDown={keydown} onClick={() => open ? close() : show()}>
      <span className={`salon-selection-value${!selected?.value ? ' is-placeholder' : ''}`}>{selected?.label || 'Selecione'}</span><span className="salon-selection-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && popup && <SelectionPopover id={listId} anchor={trigger} host={popup.host} onClose={close} role="listbox" label={popup.label} className="salon-select-options">
      {!options.length && <p className="salon-selection-empty">Nenhuma opção disponível</p>}
      {options.map((option, index) => <div key={`${option.value}-${index}`}>
        {option.group && option.group !== options[index - 1]?.group && <div className="salon-option-group">{option.group}</div>}
        <div id={`${listId}-${index}`} role="option" aria-selected={option.value === selected?.value} aria-disabled={option.disabled || undefined} className={`salon-select-option${active === index ? ' is-active' : ''}`} onPointerMove={() => !option.disabled && setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}><span>{option.label}</span>{option.value === selected?.value && <span aria-hidden="true">✓</span>}</div>
      </div>)}
    </SelectionPopover>}
  </span>
}
