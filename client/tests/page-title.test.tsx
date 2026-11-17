import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { pageTitle } from '../src/routes/pageTitles'
import { routePaths } from '../src/routes/routePaths'

test('all application routes have branded titles, with a safe fallback for unknown pages', () => {
  for (const path of Object.values(routePaths)) {
    const title = pageTitle(path)
    assert.ok(title.endsWith('Vick Florez'))
    if (path !== '/') assert.notEqual(title, 'Vick Florez', path)
  }
  assert.equal(pageTitle('/dashboard/schedule'), 'Agenda | Vick Florez')
  assert.equal(pageTitle('/dashboard/produtos/'), 'Produtos | Vick Florez')
  assert.equal(pageTitle('/dashboard/clientes/42'), 'Detalhes do cliente | Vick Florez')
  assert.equal(pageTitle('/agendar/reservar'), 'Agendar atendimento | Vick Florez')
  assert.equal(pageTitle('/nao-existe'), 'Vick Florez')
  assert.equal(pageTitle('/dashboard/produtos-inexistentes'), 'Vick Florez')
})

test('browser title follows navigation between public and salon pages', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MemoryRouter, useNavigate } = await import('react-router-dom')
  const { PageTitle } = await import('../src/routes/PageTitle')
  let navigate: ReturnType<typeof useNavigate>
  function Fixture() { navigate = useNavigate(); return h(PageTitle) }
  const root = createRoot(document.getElementById('root')!)
  try {
    act(() => root.render(h(MemoryRouter, { initialEntries: ['/'] }, h(Fixture))))
    assert.equal(document.title, 'Vick Florez')
    for (const [path, expected] of [['/login', 'Área do salão'], ['/dashboard/schedule', 'Agenda'], ['/dashboard/produtos', 'Produtos'], ['/agendar', 'Agendar agora']]) {
      act(() => { void navigate(path) })
      assert.equal(document.title, expected + ' | Vick Florez')
    }
  } finally { act(() => root.unmount()); dom.window.close() }
})
