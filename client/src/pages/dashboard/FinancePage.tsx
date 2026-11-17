import { useState } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import FinanceLedgerPage from './FinanceLedgerPage'
import FinanceReportsPage from './FinanceReportsPage'

export default function FinancePage() {
  const { user } = useAuth()
  const [view, setView] = useState<'ledger' | 'reports'>('ledger')
  const canViewReports = !!user && user.role !== 'OPERATIONAL' && allowed(user, 'finance.view')
  return <>
    {canViewReports && <nav className="social-actions" aria-label="Visões do financeiro">
      <button type="button" aria-pressed={view === 'ledger'} onClick={() => setView('ledger')}>Recebimentos e lançamentos</button>
      <button type="button" aria-pressed={view === 'reports'} onClick={() => setView('reports')}>Produção e vendas</button>
    </nav>}
    {view === 'reports' && canViewReports ? <FinanceReportsPage /> : <FinanceLedgerPage />}
  </>
}
