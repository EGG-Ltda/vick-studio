import FinanceParticipation from './FinanceParticipation'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { financeRequest, financeQuery, localDate, brl, dateLabel } from './financeApi'
import type { FinanceFilters, Choice } from './financeApi'
import FinanceFiltersForm from './FinanceFiltersForm'
import './finance.css'

type Metrics={revenueCents:number;refundCents:number;netCents:number;knownCostCents:number;contributionCents:number;missingCosts:number;quantity:number;procedureCount:number;productCount:number;attendanceCount:number;commissionCents:number|null}
type InsightRow=Metrics&{id:string;name:string;stock?:number|null;receivedCents?:number|null}
type Insights={scope:'own'|'salon';summary:Metrics;employees:InsightRow[];products:InsightRow[];procedures:InsightRow[];previous:Metrics&{start:string;end:string};productivity:{minutes:number|null;hourlyCents:number|null;ticketCents:number|null};employeeProducts:InsightRow[];customers:InsightRow[]}
function comparison(current:number,previous:number) { return previous ? `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1,signDisplay:'exceptZero'}).format((current-previous)/previous*100)}% em relação ao período anterior` : 'Sem base de comparação no período anterior' }
const initial=():FinanceFilters=>{const now=new Date();return {start:localDate(new Date(now.getFullYear(),now.getMonth(),1)),end:localDate(new Date(now.getFullYear(),now.getMonth()+1,0)),employeeId:'',treatmentId:'',search:'',sort:'value',page:0}}

function InsightTable({title,nameLabel,rows,showCosts=false,showStock=false,showActivity=false,showReceipts=false,sort}:{title:string;nameLabel:string;rows:InsightRow[];showCosts?:boolean;showStock?:boolean;showActivity?:boolean;showReceipts?:boolean;sort:FinanceFilters['sort']}) {
  const total=rows.reduce((sum,row)=>sum+row.revenueCents,0)
  const ordered=[...rows].sort((a,b)=>sort==='quantity'?b.quantity-a.quantity:b.revenueCents-a.revenueCents)
  return <section className="finance-panel"><h2>{title}</h2>{!rows.length?<p>Nenhum registro no período e filtros selecionados.</p>:<div className="users-table-wrapper"><table className="users-table finance-insight-table"><thead><tr><th>{nameLabel}</th><th>Quantidade</th>{showActivity&&<><th>Procedimentos</th><th>Produtos</th><th>Atendimentos</th><th>Comissões reconhecidas</th></>}{showStock&&<th>Estoque atual</th>}<th>Valor gerado</th><th>Participação</th><th>Estornos atribuídos</th>{showReceipts&&<th>Recebido atribuído no período</th>}{showCosts&&<><th>Custos registrados</th><th>Saldo após custos registrados</th></>}</tr></thead><tbody>{ordered.map((row)=><tr key={row.id}><th scope="row">{row.name}</th><td>{row.quantity}{row.quantity===0&&<small className="customer-muted"> · sem saídas no período</small>}</td>{showActivity&&<><td>{row.procedureCount}</td><td>{row.productCount}</td><td>{row.attendanceCount}</td><td>{brl(row.commissionCents)}</td></>}{showStock&&<td>{row.stock ?? 'Não disponível'}</td>}<td className="finance-number">{brl(row.revenueCents)}</td><td><FinanceParticipation value={total?row.revenueCents/total*100:null} label={`Participação de ${row.name}`}/></td><td className="finance-number">{brl(row.refundCents)}</td>{showReceipts&&<td>{brl(row.receivedCents??null)}</td>}{showCosts&&<><td>{brl(row.knownCostCents)}</td><td>{brl(row.contributionCents)}{row.missingCosts>0&&<small className="customer-muted"> · custos incompletos</small>}</td></>}</tr>)}</tbody></table></div>}</section>
}

export default function FinanceInsightsPage() {
  const [filters,setFilters]=useState(initial),[draft,setDraft]=useState(initial)
  const [options,setOptions]=useState<{employees:Choice[];treatments:Choice[]}>({employees:[],treatments:[]})
  const [data,setData]=useState<Insights|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0)
  useEffect(()=>{
    const controller=new AbortController()
    Promise.all([
      financeRequest<Insights>(`insights?${financeQuery(filters)}`,{signal:controller.signal}),
      financeRequest<typeof options>('insight-options',{signal:controller.signal}),
    ]).then(([result,choices])=>{if(!controller.signal.aborted){setData(result);setOptions(choices);setError('')}})
      .catch((cause)=>{if(!controller.signal.aborted){setError(cause.message);setData(null)}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[filters,revision])
  function apply(event:FormEvent){event.preventDefault();setLoading(true);setError('');setFilters({...draft,page:0})}
  const own=data?.scope==='own'
  return <section className="dashboard-view finance-view">
    <header className="dashboard-view-header"><div><span className="salon-eyebrow">Resultados do salão</span><h1>{own?'Meus insights':'Insights'}</h1><p>{own?'Seu rendimento e produtividade, limitados aos seus registros.':'Produtividade da equipe, desempenho de produtos e relacionamento financeiro com clientes.'}</p></div></header>
    <FinanceFiltersForm value={draft} onChange={setDraft} onSubmit={apply} employees={options.employees} treatments={options.treatments}/>
    <p className="finance-help">O período considera procedimentos concluídos e produtos registrados em comandas concluídas ou vendas registradas. Cortesias têm valor de venda zero. O estoque exibido é o saldo atual, não o saldo histórico do período. Produtos respeitam período, funcionário e busca; o filtro de procedimento afeta somente serviços.</p>
    {loading?<p role="status">Consultando indicadores…</p>:error?<p className="finance-error" role="alert">{error}<button onClick={()=>{setLoading(true);setRevision((value)=>value+1)}}>Tentar novamente</button></p>:data&&<>
      <p>Período: {dateLabel(filters.start)} a {dateLabel(filters.end)} · Comparação: {dateLabel(data.previous.start)} a {dateLabel(data.previous.end)}</p>
      <div className="metric-grid finance-metrics">
        <article><span>Valor gerado</span><strong>{brl(data.summary.revenueCents)}</strong><small>{comparison(data.summary.revenueCents,data.previous.revenueCents)}</small></article>
        <article><span>Procedimentos concluídos</span><strong>{data.summary.procedureCount}</strong><small>{comparison(data.summary.procedureCount,data.previous.procedureCount)}</small></article>
        <article><span>Produtos e consumos</span><strong>{data.summary.productCount}</strong><small>Inclui cortesias identificadas com valor zero.</small></article>
        <article><span>Atendimentos com procedimentos concluídos</span><strong>{data.summary.attendanceCount}</strong><small>{comparison(data.summary.attendanceCount,data.previous.attendanceCount)}</small></article>
        <article><span>Ticket médio por atendimento</span><strong>{brl(data.productivity.ticketCents)}</strong><small>Valor dos procedimentos por atendimento concluído.</small></article>
        <article><span>Comissões reconhecidas</span><strong>{brl(data.summary.commissionCents)}</strong><small>Após ajustes registrados; não significa pagamento ao funcionário.</small></article>
      </div>
      <section className="finance-panel"><h2>Tempo e produtividade</h2><div className="metric-grid finance-metrics"><article><span>Horas registradas em atendimento</span><strong>{data.productivity.minutes===null?'Sem dados':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(data.productivity.minutes/60)} h`}</strong><small>Sem duplicar intervalos do mesmo funcionário.</small></article><article><span>Valor gerado por hora</span><strong>{brl(data.productivity.hourlyCents)}</strong><small>Disponível quando todos os procedimentos possuem início e fim reais registrados.</small></article></div></section>
      <InsightTable title={own?'Minha produtividade':'Produtividade dos funcionários'} nameLabel="Funcionário" rows={data.employees} sort={filters.sort} showActivity/>
      <InsightTable title="Procedimentos mais vendidos" nameLabel="Procedimento" rows={data.procedures} sort={filters.sort}/>
      <InsightTable title="Produtos mais vendidos" nameLabel="Produto" rows={data.products} sort={filters.sort} showCosts={!own} showStock={!own}/>
      <InsightTable title="Produtos por funcionário" nameLabel="Funcionário e produto" rows={data.employeeProducts} sort={filters.sort}/>
      <InsightTable title={own?'Clientes dos meus atendimentos':'Valor gerado por cliente'} nameLabel="Cliente" rows={data.customers} sort={filters.sort} showCosts={!own} showReceipts={!own}/>
      <p className="booking-availability-notice">Valor gerado não é valor recebido nem lucro líquido. Recebimentos consideram os pagamentos e devoluções no período vinculados às comandas exibidas, rateados quando o filtro seleciona somente parte de uma comanda. Vendas avulsas sem comanda não possuem recebimentos vinculados. O saldo desconta estornos atribuídos e apenas os custos registrados e autorizados (comissões e custos/repasse de produtos). Materiais dos procedimentos, impostos, despesas fixas e outros custos não cadastrados não estão incluídos. {data.summary.missingCosts>0&&`${data.summary.missingCosts} itens têm custos ausentes ou não autorizados para consulta.`}</p>
    </>}
  </section>
}
