import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {financeRequest,inputCents,localDate,brl,dateLabel} from './financeApi'
import type {FinanceOptions,PendingTreatment} from './financeApi'

export type FinanceEntryKind='treatment'|'product'|'sale'
export default function FinanceEntryForm({kind,options,pending,onClose,onSaved}:{kind:FinanceEntryKind;options:FinanceOptions;pending:PendingTreatment[];onClose:()=>void;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [name,setName]=useState('')
  const [price,setPrice]=useState('')
  const [itemId,setItemId]=useState('')
  const [employeeId,setEmployeeId]=useState('')
  const [customerId,setCustomerId]=useState('')
  const [date,setDate]=useState(localDate(new Date()))
  const [quantity,setQuantity]=useState('1')
  const [discount,setDiscount]=useState('0')
  const [actualStart,setActualStart]=useState('')
  const [actualEnd,setActualEnd]=useState('')
  useEffect(()=>{dialog.current?.showModal()},[])
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('')
    try {
      let path:string;let body:unknown
      if(kind==='product'){path='products';body={name,priceCents:inputCents(price)}}
      else if(kind==='treatment') {
        path='treatments';body={scheduleItemId:Number(itemId),performedOn:date,quantity:Number(quantity),discountCents:inputCents(discount),
          ...(actualStart?{actualStartedAt:new Date(actualStart).toISOString()}:{}),...(actualEnd?{actualEndedAt:new Date(actualEnd).toISOString()}:{})}
      } else {
        path='sales';body={employeeId:Number(employeeId),...(customerId?{customerId:Number(customerId)}:{}),soldOn:date,
          items:[{productId:Number(itemId),quantity:Number(quantity),discountCents:inputCents(discount)}]}
      }
      await financeRequest(path,{method:'POST',body:JSON.stringify(body)});onSaved()
    } catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar.')}finally{setBusy(false)}
  }
  const title=kind==='product'?'Cadastrar produto':kind==='sale'?'Registrar venda de produto':'Confirmar procedimento realizado'
  return <dialog ref={dialog} className="finance-dialog" onCancel={(event)=>{if(busy)event.preventDefault();else onClose()}} aria-labelledby="finance-entry-title">
    <form onSubmit={submit}>
      <h2 id="finance-entry-title">{title}</h2>
      {kind==='product'?<><label>Nome do produto<input autoFocus required maxLength={255} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Preço (R$)<input required type="number" min="0" max="10000000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label></>:
        <><label>{kind==='sale'?'Produto':'Item do atendimento'}<select autoFocus required value={itemId} onChange={e=>setItemId(e.target.value)}>
          <option value="">Selecione</option>{kind==='sale'?options.products.map(item=><option value={item.id} key={item.id}>{item.name} · {brl(item.priceCents)}</option>):
            pending.map(item=><option value={item.id} key={item.id}>#{item.scheduleId} · {dateLabel(item.date)} {item.date.slice(11)} · {item.customer} · {item.employee} · {item.treatment} · {brl(inputCents(item.price))}</option>)}</select></label>
          {kind==='treatment'&&!pending.length&&<p role="status">Nenhum item pendente no período selecionado. Cadastre um atendimento real na agenda.</p>}
          {kind==='sale'&&<><label>Funcionário<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">Selecione</option>{options.employees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Cliente<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Não informado</option>{options.customers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
          <label>Data da realização<input required type="date" max={localDate(new Date())} value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label>Quantidade<input required type="number" min="1" max="10000" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
          <label>Desconto total deste item (R$)<input required type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
          {kind==='treatment'&&<><p>O preço é o registrado no agendamento. Confirme somente itens efetivamente realizados. Divida descontos gerais entre os itens antes de confirmar, sem repetir o desconto.</p>
            <label>Início real (opcional)<input type="datetime-local" value={actualStart} onChange={e=>setActualStart(e.target.value)}/></label>
            <label>Fim real (opcional)<input type="datetime-local" required={!!actualStart} value={actualEnd} onChange={e=>setActualEnd(e.target.value)}/></label></>}
        </>}
      {error&&<p className="finance-error" role="alert">{error}</p>}
      <div className="schedule-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy?'Salvando…':'Salvar'}</button></div>
    </form>
  </dialog>
}
