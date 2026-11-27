import { lazy, Suspense, useState } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import FinanceLedgerPage from './FinanceLedgerPage'
import FinanceReportsPage from './FinanceReportsPage'

const FinanceInsightsPage=lazy(()=>import('./FinanceInsightsPage'))

export default function FinancePage() {
  const { user } = useAuth()
  const [view, setView] = useState<'ledger' | 'reports' | 'insights'>('ledger')
  const canViewReports = !!user &&
    (user.role === 'MASTER' ||
      (user.dataScope ? user.dataScope === 'salon' : user.role === 'ADMIN')) &&
    allowed(user, 'finance.view')
  return <>
    {allowed(user, 'finance.view') && <nav className="social-actions finance-view-tabs" aria-label="Visões do financeiro">
      <button type="button" aria-pressed={view === 'ledger'} onClick={() => setView('ledger')}>Recebimentos e lançamentos</button>
      {canViewReports && <button type="button" aria-pressed={view === 'reports'} onClick={() => setView('reports')}>Produção e vendas</button>}
      <button type="button" aria-pressed={view === 'insights'} onClick={() => setView('insights')}>Insights</button>
    </nav>}
    {view === 'insights' && allowed(user, 'finance.view') ? <Suspense fallback={<p role="status">Carregando insights…</p>}><FinanceInsightsPage /></Suspense> : view === 'reports' && canViewReports ? <FinanceReportsPage /> : <FinanceLedgerPage />}
  </>
}
