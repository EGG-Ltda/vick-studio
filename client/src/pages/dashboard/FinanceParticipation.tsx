export default function FinanceParticipation({value,label}: {value:number|null;label:string}) {
  const percent=value===null?0:Math.max(0,Math.min(100,value))
  return <div className="finance-participation">
    <span className="finance-participation-value">{value===null?'Sem base':`${percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</span>
    <svg className="finance-participation-track" viewBox="0 0 100 6" preserveAspectRatio="none"
      role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      aria-valuetext={value===null?'Sem base de comparação':`${percent.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}>
      <rect className="finance-participation-rail" width="100" height="6" rx="3"/>
      <rect className="finance-participation-fill" width={percent} height="6" rx="3"/>
    </svg>
  </div>
}
