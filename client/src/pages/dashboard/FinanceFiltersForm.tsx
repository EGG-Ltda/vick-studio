import type { FormEvent } from 'react'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import type { FinanceFilters, Choice } from './financeApi'
import './finance.css'

export default function FinanceFiltersForm({value,onChange,onSubmit,employees,treatments,showRankingSort=true}: {
  value:FinanceFilters;onChange:(value:FinanceFilters)=>void;onSubmit:(event:FormEvent)=>void;
  employees:Choice[];treatments:Choice[];
  showRankingSort?:boolean;
}) {
  return <form className="user-form finance-filters" aria-label="Filtros do financeiro" onSubmit={onSubmit}>
    <label className="finance-field"><span className="finance-field-label">Data inicial</span><SalonInput type="date" required value={value.start} onChange={(e)=>onChange({...value,start:e.target.value})}/></label>
    <label className="finance-field"><span className="finance-field-label">Data final</span><SalonInput type="date" required min={value.start} value={value.end} onChange={(e)=>onChange({...value,end:e.target.value})}/></label>
    <label className="finance-field"><span className="finance-field-label">Funcionário</span><SalonSelect value={value.employeeId} onChange={(e)=>onChange({...value,employeeId:e.target.value})}><option value="">Todos os autorizados</option>{employees.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</SalonSelect></label>
    <label className="finance-field"><span className="finance-field-label">Procedimento</span><SalonSelect value={value.treatmentId} onChange={(e)=>onChange({...value,treatmentId:e.target.value})}><option value="">Todos</option>{treatments.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</SalonSelect></label>
    <label className="finance-field finance-filter-search"><span className="finance-field-label">Buscar</span><SalonInput maxLength={100} value={value.search} placeholder="Cliente, funcionário ou item" onChange={(e)=>onChange({...value,search:e.target.value})}/></label>
    {showRankingSort&&<label className="finance-field"><span className="finance-field-label">Ordenar rankings</span><SalonSelect value={value.sort} onChange={(e)=>onChange({...value,sort:e.target.value as FinanceFilters['sort']})}><option value="value">Valor gerado</option><option value="quantity">Quantidade</option></SalonSelect></label>}
    <button className="primary-button">Aplicar filtros</button>
  </form>
}
