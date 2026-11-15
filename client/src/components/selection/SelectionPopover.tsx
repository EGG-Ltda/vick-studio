import { useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject, KeyboardEventHandler } from 'react'
import { createPortal } from 'react-dom'

export function SelectionPopover({ id, anchor, host, onClose, children, className = '', role = 'dialog', label, labelledBy, activeDescendant, onKeyDown }: {
  id: string; anchor: RefObject<HTMLElement | null>; host: HTMLElement; onClose: (restoreFocus?: boolean) => void; children: ReactNode; className?: string; role?: 'dialog' | 'listbox'; label?: string; labelledBy?: string; activeDescendant?: string; onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose })
  useLayoutEffect(() => {
    const panel = ref.current, trigger = anchor.current
    if (!panel || !trigger) return
    // Native popovers enter the top layer, above scrolling dialogs and tables.
    const supported = typeof panel.showPopover === 'function'
    if (supported) panel.showPopover()
    const place = () => {
      const rect = trigger.getBoundingClientRect()
      const viewport = window.visualViewport
      const width = viewport?.width ?? window.innerWidth
      const height = viewport?.height ?? window.innerHeight
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
      const desired = role === 'listbox' ? Math.max(rect.width, 240) : 336
      panel.style.width = Math.max(0, Math.min(desired, width - 24)) + 'px'
      panel.style.maxHeight = Math.max(120, height - 24) + 'px'
      const panelHeight = panel.getBoundingClientRect().height
      const below = top + height - rect.bottom - 12, above = rect.top - top - 12
      const y = below >= panelHeight || below >= above ? rect.bottom + 6 : rect.top - panelHeight - 6
      panel.style.left = Math.max(left + 12, Math.min(rect.left, left + width - panel.offsetWidth - 12)) + 'px'
      panel.style.top = Math.max(top + 12, Math.min(y, top + height - panelHeight - 12)) + 'px'
    }
    place()
    const resize = new ResizeObserver(place)
    resize.observe(panel)
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node)) close.current(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(true) }
    }
    const focus = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node)) close.current(false)
    }
    const disabled = new MutationObserver(() => {
      const control = trigger.matches('button,input') ? trigger : trigger.querySelector('input,button')
      if (control?.matches(':disabled')) close.current(false)
    })
    let ancestor: HTMLElement | null = trigger
    while (ancestor) { if (ancestor === trigger || ancestor.tagName === 'FIELDSET') disabled.observe(ancestor, { attributes: true, subtree: ancestor === trigger, attributeFilter: ['disabled'] }); ancestor = ancestor.parentElement }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('focusin', focus)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      if (supported && panel.matches(':popover-open')) panel.hidePopover()
      resize.disconnect()
      disabled.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('focusin', focus)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [anchor, role])
  return createPortal(<div ref={ref} id={id} popover={typeof HTMLElement.prototype.showPopover === 'function' ? 'manual' : undefined} className={`salon-selection-popover ${className}`} role={role} aria-label={label} aria-labelledby={labelledBy} aria-activedescendant={activeDescendant} onKeyDown={onKeyDown}>{children}</div>, host)
}
