import FinanceFiltersForm from './FinanceFiltersForm'
import './finance.css'
import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {financeRequest,financeQuery,exportFinanceCsv,brl,localDate,dateLabel} from './financeApi'
import type {FinanceFilters,FinanceAccess,FinanceOptions,FinanceReport,PendingTreatment} from './financeApi'
import FinanceEntryForm from './FinanceEntryForm'
import type {FinanceEntryKind} from './FinanceEntryForm'

function initialFilters():FinanceFilters {
  const now=new Date()
  return {start:localDate(new Date(now.getFullYear(),now.getMonth(),1)),end:localDate(new Date(now.getFullYear(),now.getMonth()+1,0)),employeeId:'',treatmentId:'',search:'',sort:'value',page:0}
}
export default function FinanceReportsPage() {
  const [filters,setFilters]=useState<FinanceFilters>(initialFilters)
  const [draft,setDraft]=useState<FinanceFilters>(initialFilters)
  const [access,setAccess]=useState<FinanceAccess|null>(null)
  const [options,setOptions]=useState<FinanceOptions|null>(null)
  const [report,setReport]=useState<FinanceReport|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [revision,setRevision]=useState(0)
  const [exporting,setExporting]=useState(false)
  const [mutating,setMutating]=useState(false)
  const [entry,setEntry]=useState<FinanceEntryKind|null>(null)
  const [pending,setPending]=useState<PendingTreatment[]>([])
  useEffect(()=>{
    let current=true
    financeRequest<FinanceAccess>('access').then(async value=>{
      if(!current)return
      setAccess(value)
      if(value.read){const data=await financeRequest<FinanceOptions>('options');if(current)setOptions(data)}else setLoading(false)
    }).catch(cause=>{if(current){setError(cause.message);setLoading(false)}})
    return()=>{current=false}
  },[revision])
  useEffect(()=>{
    if(!access?.read)return
    const controller=new AbortController()
    financeRequest<FinanceReport>(`report?${financeQuery(filters)}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted){setReport(data);setLoading(false)}})
      .catch(cause=>{if(!controller.signal.aborted){setError(cause.message);setReport(null);setLoading(false)}})
    return()=>controller.abort()
  },[access,filters,revision])
  function apply(event:FormEvent){event.preventDefault();setError('');setLoading(true);setReport(null);setFilters({...draft,page:0})}
  function refresh(){setLoading(true);setError('');setRevision(value=>value+1)}
  async function openEntry(kind:FinanceEntryKind){
    setError('');setMutating(true)
    try{if(kind==='treatment')setPending(await financeRequest(`pending?${financeQuery(filters)}`));setEntry(kind)}
    catch(cause){setError((cause as Error).message)}finally{setMutating(false)}
  }
  async function reverse(category:'treatments'|'sales',id:number){
    const reason=window.prompt('Informe o motivo do estorno (mínimo de 5 caracteres). O histórico será preservado.')
    if(reason===null)return
    if(reason.trim().length<5){setError('Informe um motivo com pelo menos 5 caracteres.');return}
    setMutating(true);setError('')
    try{await financeRequest(`${category}/${id}/reverse`,{method:'POST',body:JSON.stringify({reason})});setNotice('Estorno registrado. Os totais foram atualizados.');refresh()}
    catch(cause){setError((cause as Error).message)}finally{setMutating(false)}
  }
  return <section className="dashboard-view finance-view">
    <header className="dashboard-view-header"><div><h1>Produção e vendas</h1><p>Registros de procedimentos realizados e produtos vendidos.</p></div>
      <div className="schedule-actions">{access?.write&&<><button disabled={mutating||loading||!options} onClick={()=>void openEntry('treatment')}>Confirmar procedimento</button>
        <button disabled={mutating||!options} onClick={()=>void openEntry('product')}>Cadastrar produto</button><button disabled={mutating||!options} onClick={()=>void openEntry('sale')}>Registrar venda</button></>}
        {access?.export&&<button className="primary-button" disabled={exporting||loading||!report} onClick={async()=>{setExporting(true);setError('');try{await exportFinanceCsv(filters)}catch(cause){setError((cause as Error).message)}finally{setExporting(false)}}}>{exporting?'Exportando…':'Exportar CSV'}</button>}</div>
    </header>
    {error&&<p role="alert" className="finance-error">{error} <button onClick={refresh}>Tentar novamente</button></p>}
    {notice&&<p role="status">{notice}</p>}
    {access&&!access.read?<p role="alert">Você não tem permissão para acessar o Financeiro. Solicite acesso ao administrador.</p>:access?.read&&<>
      <FinanceFiltersForm value={draft} onChange={setDraft} onSubmit={apply} employees={options?.employees ?? []} treatments={options?.treatments ?? []} showRankingSort={false}/>
      <p id="finance-filter-help" className="finance-help">Valores de procedimentos concluídos e vendas, sem representar recebimentos. Produtos respeitam período, funcionário e busca; o filtro de procedimento se aplica somente aos serviços. Período máximo: 366 dias.</p>
      {loading&&<p role="status">Carregando financeiro…</p>}
      {!loading&&report&&<>
        <p>Período: {dateLabel(filters.start)} a {dateLabel(filters.end)} · {report.recordTotal} registros</p>
        <section className="finance-panel"><h2>Procedimentos e produtos registrados</h2>
          <p>Os itens concluídos da Agenda e os produtos da comanda entram automaticamente. Os indicadores e rankings estão na aba Insights.</p>
          <div className="users-table-wrapper"><table className="users-table"><thead><tr>{['Data','Funcionário','Cliente','Tipo','Procedimento ou produto','Quantidade','Valor bruto','Desconto','Valor final',...(access.write?['Ações']:[])].map(title=><th key={title} scope="col">{title}</th>)}</tr></thead>
            <tbody>{!report.records.length?<tr><td colSpan={access.write?10:9}>Nenhum registro para os filtros selecionados.</td></tr>:report.records.map(row=><tr key={row.source+':'+row.id}>
              <td>{dateLabel(row.date)}</td><td>{row.employee}</td><td>{row.customer}</td><td>{row.kind==='procedure'?'Procedimento':'Produto'}</td><td>{row.item}</td><td>{row.quantity}</td><td className="finance-number">{brl(row.grossCents)}</td><td className="finance-number">{brl(row.discountCents)}</td><td className="finance-number">{brl(row.finalCents)}</td>
              {access.write&&<td>{row.kind==='procedure'&&row.id>0?<button disabled={mutating} onClick={()=>void reverse('treatments',row.id)} aria-label={`Estornar ${row.item} de ${row.customer}`}>Estornar</button>:<small>{row.orderId?`Comanda #${row.orderId}`:`Venda #${row.saleId}`}</small>}</td>}</tr>)}</tbody></table></div>
          <nav className="users-pagination" aria-label="Paginação dos registros"><button disabled={!filters.page||mutating} onClick={()=>{setLoading(true);setFilters({...filters,page:filters.page-1})}}>Anterior</button>
            <span>Página {filters.page+1} · {report.recordTotal} registros</span><button disabled={(filters.page+1)*report.pageSize>=report.recordTotal||mutating} onClick={()=>{setLoading(true);setFilters({...filters,page:filters.page+1})}}>Próxima</button></nav>
        </section>
        {access.write&&report.sales.some(sale=>sale.id>0)&&<details className="finance-panel"><summary>Estornar vendas de produtos</summary>{report.sales.filter(sale=>sale.id>0).map(sale=><p key={sale.id}>Venda #{sale.id} · {dateLabel(sale.date)} <button disabled={mutating} onClick={()=>void reverse('sales',sale.id)}>Estornar venda #{sale.id}</button></p>)}</details>}
      </>}
    </>}
    {!access&&loading&&<p role="status">Verificando acesso…</p>}
    {entry&&options&&<FinanceEntryForm key={entry} kind={entry} options={options} pending={pending} onClose={()=>setEntry(null)} onSaved={()=>{setEntry(null);setNotice('Registro salvo com sucesso.');refresh()}}/>}
  </section>
}
