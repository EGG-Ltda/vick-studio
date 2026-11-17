import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLButtonElement','HTMLDialogElement','Node','Event','MouseEvent','KeyboardEvent','FocusEvent','MutationObserver']) Object.defineProperty(globalThis, key, { configurable:true, value:(dom.window as any)[key] })
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator})
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT:true,
  ResizeObserver:class { observe(){} disconnect(){} },
  requestAnimationFrame:(callback:FrameRequestCallback)=>setTimeout(()=>callback(Date.now()),0),
  cancelAnimationFrame:clearTimeout,
})
dom.window.HTMLElement.prototype.scrollIntoView=function(){}
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
const React = await import('react')
const { act, createElement: h, useState } = React
const { createRoot } = await import('react-dom/client')
const { SalonInput } = await import('../src/components/selection/SalonInput')
const { SalonSelect } = await import('../src/components/selection/SalonSelect')
const { SalonModal } = await import('../src/components/SalonModal')
const { calendarDays,dateParts,shiftDay,shiftMonth,parseTemporal,temporalDisplay,temporalStepValid } = await import('../src/components/selection/temporal')
const roots:ReturnType<typeof createRoot>[]=[]
function mount(node:React.ReactNode){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);roots.push(root);act(()=>root.render(node));return {container,render:(node:React.ReactNode)=>act(()=>root.render(node))}}
function click(element:Element){assert.ok(element);act(()=>{(element as HTMLElement).click()})}
function key(element:Element,value:string,extra={}){act(()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra})))}
function type(element:HTMLInputElement,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))})}
afterEach(()=>{for(const root of roots.splice(0))act(()=>root.unmount());document.body.innerHTML=''})

test('calendar arithmetic and Brazilian parsing preserve dates across leap years, year boundaries and time zones',()=>{
  assert.equal(dateParts('2025-02-29'),null)
  assert.ok(dateParts('2024-02-29'))
  assert.equal(shiftDay('2026-12-31',1),'2027-01-01')
  assert.equal(shiftMonth('2024-01-31',1),'2024-02-29')
  assert.equal(calendarDays('2026-11')[0],'2026-11-01')
  assert.equal(calendarDays('2026-11').length,42)
  assert.equal(parseTemporal('date','15/11/2026'),'2026-11-15')
  assert.equal(parseTemporal('date','31/04/2026'),null)
  assert.equal(parseTemporal('month','12/2026'),'2026-12')
  assert.equal(parseTemporal('time','24:00'),null)
  assert.equal(parseTemporal('datetime-local','15/11/2026 14:30'),'2026-11-15T14:30')
  assert.equal(temporalDisplay('datetime-local','2026-11-15T14:30'),'15/11/2026 14:30')
  assert.equal(temporalStepValid('time','09:15','09:00',900),true)
  assert.equal(temporalStepValid('time','09:10','09:00',900),false)
})

test('custom select keeps real change events, canonical form values and accessible label',()=>{
  const received:string[]=[]
  function Fixture(){const [value,setValue]=useState('');return h('form',{},h('label',{},'Profissional',h(SalonSelect,{name:'employee',value,onChange:e=>{assert.ok(e.target instanceof HTMLSelectElement);received.push(e.target.value);setValue(e.target.value)}},h('option',{value:''},'Selecione'),h('option',{value:'carla'},'Carla'),h('option',{value:'fabi'},'Fabi'))))}
  mount(h(Fixture))
  const trigger=document.querySelector('[role="combobox"]')!
  assert.equal(trigger.getAttribute('aria-label'),'Profissional')
  click(trigger)
  click([...document.querySelectorAll('[role="option"]')].find(node=>node.textContent==='Fabi')!)
  assert.deepEqual(received,['fabi'])
  assert.equal(new dom.window.FormData(document.querySelector('form')!).get('employee'),'fabi')
  assert.equal(trigger.getAttribute('aria-expanded'),'false')
  assert.equal(document.activeElement,trigger)
})

test('select keyboard skips disabled options, supports typeahead and closes on Escape without closing its modal',()=>{
  let value=''
  mount(h(SalonModal,{title:'Editar',description:'Teste',onClose:()=>assert.fail('Parent modal must stay open')},h('label',{},'Serviço',h(SalonSelect,{defaultValue:'a',onChange:e=>{value=e.target.value}},h('option',{value:'a'},'Água'),h('option',{value:'b',disabled:true},'Bloqueado'),h('option',{value:'c'},'Cabelo')))))
  const trigger=document.querySelector('[role="combobox"]')!
  key(trigger,'ArrowDown');key(trigger,'ArrowDown');key(trigger,'Enter')
  assert.equal(value,'c')
  key(trigger,'a');key(trigger,'Enter')
  assert.equal(value,'a')
  click(trigger);key(trigger,'Escape')
  assert.equal(trigger.getAttribute('aria-expanded'),'false')
  assert.equal(document.querySelector('dialog')!.open,true)
  assert.equal(document.activeElement,trigger)
})

test('select preserves required validation and fieldset disabled behavior',()=>{
  const {render}=mount(h('form',{},h('fieldset',{disabled:true},h('label',{},'Obrigatório',h(SalonSelect,{required:true,name:'choice'},h('option',{value:''},'Selecione'),h('option',{value:'yes'},'Sim'))))))
  let trigger=document.querySelector('[role="combobox"]')!
  click(trigger);assert.equal(document.querySelector('[role="listbox"]'),null)
  render(h('form',{},h('label',{},'Obrigatório',h(SalonSelect,{required:true,name:'choice'},h('option',{value:''},'Selecione'),h('option',{value:'yes'},'Sim')))))
  trigger=document.querySelector('[role="combobox"]')!
  act(()=>assert.equal(document.querySelector('form')!.checkValidity(),false))
  assert.equal(document.activeElement,trigger)
  assert.equal(trigger.getAttribute('aria-invalid'),'true')
})

test('date input emits ISO while displaying Brazilian dates, updates from external props and rejects invalid drafts',()=>{
  const received:string[]=[]
  function Fixture({date='2026-11-15'}){const [value,setValue]=useState(date);return h('form',{},h('label',{},'Data',h(SalonInput,{type:'date',name:'date',value,required:true,onChange:e=>{assert.ok(e.target instanceof HTMLInputElement);received.push(e.target.value);setValue(e.target.value)}})))}
  mount(h(Fixture))
  const field=document.querySelector('input[type="text"]') as HTMLInputElement
  assert.equal(field.value,'15/11/2026')
  type(field,'20/11/2026')
  assert.deepEqual(received,['2026-11-20'])
  assert.equal(new dom.window.FormData(document.querySelector('form')!).get('date'),'2026-11-20')
  type(field,'31/02/2026')
  act(()=>assert.equal(document.querySelector('form')!.checkValidity(),false))
  assert.equal(received.length,1)
  assert.equal(field.getAttribute('aria-invalid'),'true')
})

test('calendar shows selected day, today and unavailable dates, respecting min/max and keyboard navigation',()=>{
  let value=''
  mount(h('label',{},'Data da reserva',h(SalonInput,{type:'date',defaultValue:'2026-11-15',min:'2026-11-10',max:'2026-11-20',onChange:e=>{value=e.target.value}})))
  click(document.querySelector('.salon-temporal-open')!)
  const selected=document.querySelector('[role="gridcell"][aria-selected="true"] button')!
  assert.equal(selected.textContent,'15')
  const unavailable=[...document.querySelectorAll('[role="gridcell"] button')].find(node=>node.textContent==='21')!
  assert.equal(unavailable.getAttribute('aria-disabled'),'true');click(unavailable);assert.equal(value,'')
  key(selected,'ArrowRight')
  assert.equal((document.activeElement as HTMLElement).textContent,'16')
  key(document.activeElement!,'Enter')
  // JSDOM does not synthesize button activation from Enter; click the focused cell.
  click(document.activeElement!)
  assert.equal(value,'2026-11-16')
  assert.equal(document.querySelector('[role="grid"]'),null)
})

test('month picker preserves yyyy-mm and lets a user choose years without scrolling through every month',()=>{
  let value=''
  mount(h('label',{},'Mês',h(SalonInput,{type:'month',defaultValue:'2026-11',min:'2026-01',max:'2027-12',onChange:e=>{value=e.target.value}})))
  click(document.querySelector('.salon-temporal-open')!)
  click([...document.querySelectorAll('.salon-calendar-choices button')].find(node=>node.textContent==='dez')!)
  assert.equal(value,'2026-12')
  assert.equal((document.querySelector('input[type="text"]') as HTMLInputElement).value,'12/2026')
})

test('time picker enforces min/max and step while retaining the existing time change handler',()=>{
  let value=''
  mount(h('label',{},'Horário',h(SalonInput,{type:'time',defaultValue:'09:00',min:'09:00',max:'10:00',step:900,onChange:e=>{value=e.target.value}})))
  click(document.querySelector('.salon-temporal-open')!)
  const minutes=document.querySelector('[role="group"][aria-label="Minutos"]')!
  const blocked=[...minutes.querySelectorAll('button')].find(node=>node.textContent==='10')!
  assert.equal((blocked as HTMLButtonElement).disabled,true)
  click([...minutes.querySelectorAll('button')].find(node=>node.textContent==='15')!)
  assert.equal(value,'09:15')
})

test('checkboxes and radios keep native labels, checked state, names, values and disabled behavior',()=>{
  let checked=false
  mount(h('form',{},h('label',{},'Ativo',h(SalonInput,{type:'checkbox',name:'active',value:'yes',onChange:e=>{checked=e.target.checked}})),h(SalonInput,{type:'radio',name:'role',value:'admin',defaultChecked:true}),h(SalonInput,{type:'radio',name:'role',value:'staff'})))
  const checkbox=document.querySelector('[type="checkbox"]') as HTMLInputElement
  click(checkbox);assert.equal(checked,true);assert.ok(checkbox.classList.contains('salon-choice'))
  assert.equal(new dom.window.FormData(document.querySelector('form')!).get('active'),'yes')
  click(document.querySelector('[type="radio"][value="staff"]')!)
  assert.equal(new dom.window.FormData(document.querySelector('form')!).get('role'),'staff')
})

test('picker stays inside its parent dialog, closes on outside interaction and safely renders without Popover API',()=>{
  mount(h(SalonModal,{title:'Funcionário',description:'Expediente',onClose:()=>{}},h('label',{},'Início',h(SalonInput,{type:'time',defaultValue:'09:00'}))))
  click(document.querySelector('.salon-temporal-open')!)
  const panel=document.querySelector('.salon-selection-popover')!
  assert.equal(panel.parentElement,document.querySelector('dialog'))
  act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})))
  assert.equal(document.querySelector('.salon-selection-popover'),null)
})
