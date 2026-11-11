import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {financeRequest,financeQuery,exportFinance,brl,localDate,dateLabel} from './financeApi'
import type {FinanceFilters,FinanceAccess,FinanceOptions,FinanceReport,Ranking,PendingTreatment} from './financeApi'
import FinanceEntryForm from './FinanceEntryForm'
import type {FinanceEntryKind} from './FinanceEntryForm'

function initialFilters():FinanceFilters {
  const now=new Date()
  return {start:localDate(new Date(now.getFullYear(),now.getMonth(),1)),end:localDate(new Date(now.getFullYear(),now.getMonth()+1,0)),employeeId:'',treatmentId:'',search:'',sort:'value',page:0}
}
const variation=(value:number|null)=>value===null?'Sem base de comparação':`${value>0?'+':''}${value.toLocaleString('pt-BR',{maximumFractionDigits:1})}% vs. período anterior`
function RankingTable({title,rows}:{title:string;rows:Ranking[]}) {
  const max=Math.max(1,...rows.map(row=>row.totalCents))
  return <section className="finance-panel"><h2>{title}</h2>{!rows.length?<p>Sem registros para os filtros selecionados.</p>:
    <div className="users-table-wrapper"><table className="users-table finance-ranking"><thead><tr><th>Posição / nome</th><th>Quantidade</th><th>Valor gerado</th><th>Participação</th></tr></thead>
      <tbody>{rows.map((row,index)=><tr key={row.id}><th scope="row">{index+1}. {row.name}<meter min={0} max={max} value={row.totalCents} aria-label={`Valor gerado por ${row.name}`}/></th>
        <td>{row.quantity}</td><td>{brl(row.totalCents)}</td><td>{row.share==null?'—':`${row.share.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</td></tr>)}</tbody></table></div>}</section>
}
export default function FinancePage() {
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
    <header className="dashboard-view-header"><div><h1>Financeiro</h1><p>Produção realizada, produtividade e vendas registradas.</p></div>
      <div className="schedule-actions">{access?.write&&<><button disabled={mutating||loading||!options} onClick={()=>void openEntry('treatment')}>Confirmar procedimento</button>
        <button disabled={mutating||!options} onClick={()=>void openEntry('product')}>Cadastrar produto</button><button disabled={mutating||!options} onClick={()=>void openEntry('sale')}>Registrar venda</button></>}
        {access?.export&&<button className="primary-button" disabled={exporting||loading||!report} onClick={async()=>{setExporting(true);setError('');try{await exportFinance(filters)}catch(cause){setError((cause as Error).message)}finally{setExporting(false)}}}>{exporting?'Exportando…':'Exportar Excel'}</button>}</div>
    </header>
    {error&&<p role="alert" className="finance-error">{error} <button onClick={refresh}>Tentar novamente</button></p>}
    {notice&&<p role="status">{notice}</p>}
    {access&&!access.read?<p role="alert">Você não tem permissão para acessar o Financeiro. Solicite acesso ao administrador.</p>:access?.read&&<>
      <form className="user-form finance-filters" onSubmit={apply}>
        <label>De<input type="date" required value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></label>
        <label>Até<input type="date" required min={draft.start} value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/></label>
        <label>Funcionário<select value={draft.employeeId} onChange={e=>setDraft({...draft,employeeId:e.target.value})}><option value="">Todos</option>{options?.employees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Procedimento<select value={draft.treatmentId} onChange={e=>setDraft({...draft,treatmentId:e.target.value})}><option value="">Todos</option>{options?.treatments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Buscar<input maxLength={100} value={draft.search} placeholder="Cliente, funcionário ou item" onChange={e=>setDraft({...draft,search:e.target.value})}/></label>
        <label>Ordenar rankings<select value={draft.sort} onChange={e=>setDraft({...draft,sort:e.target.value as 'value'|'quantity'})}><option value="value">Valor gerado</option><option value="quantity">Quantidade</option></select></label>
        <button className="primary-button">Aplicar filtros</button>
      </form>
      <p className="finance-help">Valores de procedimentos concluídos e vendas, sem representar recebimentos. Produtos respeitam período, funcionário e busca; o filtro de procedimento se aplica somente aos serviços. Período máximo: 366 dias.</p>
      {loading&&<p role="status">Carregando financeiro…</p>}
      {!loading&&report&&<>
        <p>Período: {dateLabel(filters.start)} a {dateLabel(filters.end)} · Comparação: {dateLabel(report.previous.start)} a {dateLabel(report.previous.end)}</p>
        <div className="metric-grid finance-metrics">
          <article><span>Procedimentos realizados</span><strong>{brl(report.summary.totalCents)}</strong><small>{variation(report.variation.total)}</small></article>
          <article><span>Atendimentos com procedimentos concluídos</span><strong>{report.summary.attendanceCount}</strong><small>{variation(report.variation.attendances)}</small></article>
          <article><span>Quantidade de procedimentos</span><strong>{report.summary.quantity}</strong><small>{variation(report.variation.quantity)}</small></article>
          <article><span>Ticket médio por atendimento</span><strong>{brl(report.summary.ticketCents)}</strong><small>{variation(report.variation.ticket)}</small></article>
          <article><span>Horas registradas em atendimento</span><strong>{report.summary.minutes===null?'Sem dados':`${(report.summary.minutes/60).toLocaleString('pt-BR',{maximumFractionDigits:2})} h`}</strong><small>Sem dupla contagem de intervalos por funcionário.</small></article>
          <article><span>Valor gerado por hora</span><strong>{brl(report.summary.hourlyCents)}</strong><small>Disponível somente com início e fim reais em todos os itens.</small></article>
        </div>
        <section className="finance-panel"><h2>Procedimentos realizados</h2><p>Bruto: {brl(report.summary.grossCents)} · Descontos: {brl(report.summary.discountCents)} · Final: {brl(report.summary.totalCents)}</p>
          <div className="users-table-wrapper"><table className="users-table"><thead><tr>{['Data','Funcionário','Cliente','Procedimento','Quantidade','Valor bruto','Desconto','Valor final',...(access.write?['Ações']:[])].map(title=><th key={title} scope="col">{title}</th>)}</tr></thead>
            <tbody>{!report.items.length?<tr><td colSpan={access.write?9:8}>Nenhum procedimento concluído para os filtros selecionados.</td></tr>:report.items.map(row=><tr key={row.id}>
              <td>{dateLabel(row.date)}</td><td>{row.employee}</td><td>{row.customer}</td><td>{row.treatment}</td><td>{row.quantity}</td><td>{brl(row.grossCents)}</td><td>{brl(row.discountCents)}</td><td>{brl(row.finalCents)}</td>
              {access.write&&<td><button disabled={mutating} onClick={()=>void reverse('treatments',row.id)} aria-label={`Estornar ${row.treatment} de ${row.customer}`}>Estornar</button></td>}</tr>)}</tbody></table></div>
          <nav className="users-pagination" aria-label="Paginação dos procedimentos"><button disabled={!filters.page||mutating} onClick={()=>{setLoading(true);setFilters({...filters,page:filters.page-1})}}>Anterior</button>
            <span>Página {filters.page+1} · {report.total} registros</span><button disabled={(filters.page+1)*report.pageSize>=report.total||mutating} onClick={()=>{setLoading(true);setFilters({...filters,page:filters.page+1})}}>Próxima</button></nav>
        </section>
        <RankingTable title="Produtividade por funcionário" rows={report.employees}/>
        {report.employees.length>0&&<div className="finance-hours">{report.employees.map(row=><p key={row.id}>{row.name}: {row.minutes==null?'Duração não registrada':`${(row.minutes/60).toLocaleString('pt-BR',{maximumFractionDigits:2})} h · ${brl(row.hourlyCents??null)}/h`}</p>)}</div>}
        <RankingTable title="Procedimentos mais vendidos (concluídos)" rows={report.treatments}/>
        <RankingTable title="Produtos mais vendidos" rows={report.productRanking}/>
        <p>Total de produtos: {brl(report.productTotalCents)}. Recebimentos: indisponíveis — os pagamentos legados não possuem conciliação confiável com estes registros.</p>
        {access.write&&report.sales.length>0&&<details className="finance-panel"><summary>Estornar vendas de produtos</summary>{report.sales.map(sale=><p key={sale.id}>Venda #{sale.id} · {dateLabel(sale.date)} <button disabled={mutating} onClick={()=>void reverse('sales',sale.id)}>Estornar venda #{sale.id}</button></p>)}</details>}
      </>}
    </>}
    {!access&&loading&&<p role="status">Verificando acesso…</p>}
    {entry&&options&&<FinanceEntryForm key={entry} kind={entry} options={options} pending={pending} onClose={()=>setEntry(null)} onSaved={()=>{setEntry(null);setNotice('Registro salvo com sucesso.');refresh()}}/>}
  </section>
}
