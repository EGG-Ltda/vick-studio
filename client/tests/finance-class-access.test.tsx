import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthContext } from '../src/core/auth/authContext'
import type { AuthUser } from '../src/core/auth/authContext'

registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context)
  },
})
const { default: FinancePage } = await import('../src/pages/dashboard/FinancePage')

const cases: { name: string; role: AuthUser['role']; scope?: AuthUser['dataScope']; permissions: string[]; reports: boolean }[] = [
  { name: 'Master retains reports', role: 'MASTER', scope: 'own', permissions: [], reports: true },
  { name: 'custom salon class can read reports', role: 'OPERATIONAL', scope: 'salon', permissions: ['finance.view'], reports: true },
  { name: 'own class cannot read salon reports', role: 'OPERATIONAL', scope: 'own', permissions: ['finance.view'], reports: false },
  { name: 'Admin with own scope cannot read salon reports', role: 'ADMIN', scope: 'own', permissions: ['finance.view'], reports: false },
  { name: 'salon scope does not grant finance permission', role: 'ADMIN', scope: 'salon', permissions: [], reports: false },
  { name: 'legacy Admin remains supported', role: 'ADMIN', permissions: ['finance.view'], reports: true },
  { name: 'legacy operational user remains restricted', role: 'OPERATIONAL', permissions: ['finance.view'], reports: false },
]

for (const example of cases) {
  test(example.name, () => {
    const user: AuthUser = {
      id: 42, login: 'test', email: 'test@example.com', role: example.role,
      permissions: example.permissions, dataScope: example.scope,
      isAdmin: example.role === 'ADMIN', isMaster: example.role === 'MASTER',
      canManagePasswords: false, mustChangePassword: false,
    }
    const markup = renderToStaticMarkup(createElement(AuthContext.Provider, {
      value: {
        user, isAuthenticated: true, isLoading: false, mustChangePassword: false,
        refreshAccess: async () => {}, signIn: async () => user,
        changePassword: async () => {}, signOut: async () => {},
      },
    }, createElement(FinancePage)))
    assert.equal(markup.includes('aria-label="Visões do financeiro"'), example.reports)
    assert.match(markup, /Consultando lançamentos/)
    assert.ok(markup.includes(example.scope === 'own' ? 'Meu financeiro' : 'Financeiro'))
  })
}
