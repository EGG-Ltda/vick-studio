import type { RefObject } from 'react'

// Fire the original React onChange against a real form control, preserving the
// existing event handlers, canonical values, form names and constraint validation.
export function commitNative(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value)
  control.dispatchEvent(new Event('change', { bubbles: true }))
  if (control instanceof HTMLInputElement) control.dispatchEvent(new Event('input', { bubbles: true }))
}
export function accessibleName(control: HTMLInputElement | HTMLSelectElement | null) {
  if (!control) return ''
  const explicit = control.getAttribute('aria-label')
  if (explicit) return explicit
  const labelled = control.getAttribute('aria-labelledby')
  if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()
  const labels = [...(control.labels ?? [])]
  const wrapper = control.closest('label')
  if (wrapper && !labels.includes(wrapper)) labels.push(wrapper)
  const originalId = control.dataset.salonLabel
  if (originalId) for (const label of document.getElementsByTagName('label')) if (label.htmlFor === originalId && !labels.includes(label)) labels.push(label)
  return labels.map(label => {
    const copy = label.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.salon-selection, input, select, button, small').forEach(node => node.remove())
    return copy.textContent?.trim() ?? ''
  }).join(' ').trim()
}
export function focusControl(ref: RefObject<HTMLElement | null>) { ref.current?.focus({ preventScroll: true }) }
