import { SalonInput } from '../../components/selection/SalonInput'
import { useEffect, useState } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { money } from '../booking/bookingApi'
import { inventoryRequest } from './inventoryApi'
import type { Page, Product, Supplier, Closing } from './inventoryApi'
import { ProductEditor } from './ProductEditor'
import { SupplierEditor } from './SupplierEditor'
import { StockModal } from './StockModal'
import { SettlementModal } from './SettlementModal'
import './inventory.css'
const month = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
export default function ProductsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'products' | 'suppliers' | 'settlements'>(
      'products',
    ),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [inactive, setInactive] = useState(false),
    [period, setPeriod] = useState(month),
    [revision, setRevision] = useState(0)
  const [products, setProducts] = useState<Page<Product> | null>(null),
    [suppliers, setSuppliers] = useState<Page<Supplier> | null>(null),
    [closing, setClosing] = useState<Page<Closing> | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Product | null | undefined>(),
    [supplierEditor, setSupplierEditor] = useState<
      Supplier | null | undefined
    >(),
    [stock, setStock] = useState<Product | null>(null),
    [settlement, setSettlement] = useState<Closing | null>(null)
  useEffect(() => {
    const c = new AbortController()
    const query = new URLSearchParams({
      search,
      page: String(page),
      inactive: String(inactive),
      period,
    })
    const promise =
      tab === 'products'
        ? inventoryRequest<Page<Product>>('/inventory/products?' + query, {
            signal: c.signal,
          })
        : tab === 'suppliers'
          ? inventoryRequest<Page<Supplier>>('/inventory/suppliers?' + query, {
              signal: c.signal,
            })
          : inventoryRequest<Page<Closing>>('/inventory/settlements?' + query, {
              signal: c.signal,
            })
    promise
      .then((result) => {
        if (c.signal.aborted) return
        if (tab === 'products') setProducts(result as Page<Product>)
        else if (tab === 'suppliers') setSuppliers(result as Page<Supplier>)
        else setClosing(result as Page<Closing>)
        setError('')
        setLoading(false)
      })
      .catch((cause) => {
        if (!c.signal.aborted) {
          setError(cause.message)
          setLoading(false)
        }
      })
    return () => c.abort()
  }, [tab, search, page, inactive, period, revision])
  const refresh = () => {
    setLoading(true)
    setRevision((r) => r + 1)
  }
  const changeTab = (value: typeof tab) => {
    setTab(value)
    setPage(0)
    setSearch('')
    setError('')
    setLoading(true)
  }
  const current =
    tab === 'products' ? products : tab === 'suppliers' ? suppliers : closing
  const currentStock = products?.items.find((p) => p.id === stock?.id) ?? stock
  const currentSettlement =
    closing?.items.find((s) => s.id === settlement?.id) ?? settlement
  return (
    <section className="dashboard-view inventory-page">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Cada detalhe, bem cuidado</span>
          <h1>Produtos</h1>
          <p>Estoque, cortesias e fornecedores em um só lugar.</p>
        </div>
        {tab === 'products' && allowed(user, 'products.manage') && (
          <button className="primary-button" onClick={() => setEditor(null)}>
            ＋ Novo produto
          </button>
        )}
        {tab === 'suppliers' && allowed(user, 'products.suppliers') && (
          <button
            className="primary-button"
            onClick={() => setSupplierEditor(null)}
          >
            ＋ Novo fornecedor
          </button>
        )}
      </header>
      <nav className="inventory-tabs" aria-label="Seções de Produtos">
        <button
          aria-current={tab === 'products' ? 'page' : undefined}
          onClick={() => changeTab('products')}
        >
          Estoque e produtos
        </button>
        {allowed(user, 'products.suppliers') && (
          <button
            aria-current={tab === 'suppliers' ? 'page' : undefined}
            onClick={() => changeTab('suppliers')}
          >
            Fornecedores
          </button>
        )}
        {allowed(user, 'products.settlements') && (
          <button
            aria-current={tab === 'settlements' ? 'page' : undefined}
            onClick={() => changeTab('settlements')}
          >
            Fechamento mensal
          </button>
        )}
      </nav>
      <div className="inventory-toolbar">
        {tab === 'settlements' ? (
          <label>
            Mês de referência
            <SalonInput
              type="month"
              min="2000-01"
              max="2099-12"
              required
              value={period}
              onChange={(e) => {
                if (e.target.value) {
                  setPeriod(e.target.value)
                  setPage(0)
                  setLoading(true)
                }
              }}
            />
          </label>
        ) : (
          <label>
            Buscar {tab === 'products' ? 'produto ou fornecedor' : 'fornecedor'}
            <SalonInput
              type="search"
              placeholder="Digite um nome"
              maxLength={100}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
                setLoading(true)
              }}
            />
          </label>
        )}
        {tab === 'products' && (
          <label className="inventory-check">
            <SalonInput
              type="checkbox"
              checked={inactive}
              onChange={(e) => {
                setInactive(e.target.checked)
                setPage(0)
                setLoading(true)
              }}
            />
            Mostrar inativos
          </label>
        )}
        <button onClick={refresh} disabled={loading}>
          Atualizar
        </button>
      </div>
      {tab === 'settlements' && (
        <p className="booking-note">
          Consignados entram no fechamento após o pagamento completo da comanda.
          Cortesias geram custo na entrada do estoque. Cancelamentos são
          lançados como ajustes no mês em que ocorrerem, preservando os repasses
          anteriores.
        </p>
      )}
      {error && (
        <p role="alert" className="booking-error">
          {error} <button onClick={refresh}>Tentar novamente</button>
        </p>
      )}
      {loading && <p role="status">Carregando…</p>}
      {!loading && !error && current && !current.items.length && (
        <div className="inventory-empty">
          <h2>
            {tab === 'products'
              ? 'Seu estoque começa aqui'
              : tab === 'suppliers'
                ? 'Nenhum fornecedor cadastrado'
                : 'Nenhum fornecedor para este fechamento'}
          </h2>
          <p>
            {tab === 'products'
              ? 'Cadastre os fornecedores e os produtos, depois registre as entradas.'
              : 'Os registros aparecerão aqui conforme o cadastro.'}
          </p>
        </div>
      )}
      {!loading && !error && tab === 'products' && (
        <div className="inventory-grid">
          {products?.items.map((p) => (
            <article className="inventory-card" key={p.id}>
              <div className="inventory-card-heading">
                <span className={`inventory-kind ${p.kind}`}>
                  {p.kind === 'courtesy' ? 'Cortesia' : 'Consignado'}
                </span>
                <span
                  className={`status-tag ${p.active ? 'status-active' : 'status-inactive'}`}
                >
                  {p.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <h2>{p.name}</h2>
              {p.supplierName && <p>{p.supplierName}</p>}
              {p.description && (
                <p className="inventory-description">{p.description}</p>
              )}
              <div className="inventory-stock">
                <strong>{p.stock}</strong>
                <span>unidades disponíveis</span>
              </div>
              <dl>
                <dt>
                  {p.kind === 'courtesy'
                    ? 'Cobrança à cliente'
                    : 'Preço de venda'}
                </dt>
                <dd>
                  {p.kind === 'courtesy' ? 'Gratuito' : money(p.salePrice)}
                </dd>
                {p.kind === 'consigned' && p.supplierPercent !== undefined && (
                  <>
                    <dt>Fornecedor / salão</dt>
                    <dd>
                      {p.supplierPercent}% / {100 - p.supplierPercent}%
                    </dd>
                  </>
                )}
                {p.kind === 'courtesy' && p.acquisitionCost !== undefined && (
                  <>
                    <dt>Custo padrão por unidade</dt>
                    <dd>{money(p.acquisitionCost)}</dd>
                  </>
                )}
              </dl>
              <div className="inventory-card-actions">
                <button onClick={() => setStock(p)}>
                  {allowed(user, 'products.stock')
                    ? 'Movimentar estoque'
                    : 'Ver movimentações'}
                </button>
                {allowed(user, 'products.manage') && (
                  <button onClick={() => setEditor(p)}>Editar produto</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && tab === 'suppliers' && (
        <div className="inventory-grid">
          {suppliers?.items.map((s) => (
            <article className="inventory-card" key={s.id}>
              <span
                className={`status-tag ${s.active ? 'status-active' : 'status-inactive'}`}
              >
                {s.active ? 'Ativo' : 'Inativo'}
              </span>
              <h2>{s.name}</h2>
              <p>{s.contact || 'Sem contato informado'}</p>
              <p className="inventory-description">{s.notes}</p>
              <button onClick={() => setSupplierEditor(s)}>
                Editar fornecedor
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && tab === 'settlements' && (
        <div className="inventory-grid">
          {closing?.items.map((s) => (
            <article className="inventory-card" key={s.id}>
              <span className="salon-eyebrow">
                {period.split('-').reverse().join('/')}
              </span>
              <h2>{s.name}</h2>
              <dl>
                <dt>Vendas recebidas (líquidas de cancelamentos)</dt>
                <dd>{money(Number(s.grossCents) / 100)}</dd>
                <dt>Parcela do fornecedor nas vendas</dt>
                <dd>{money(Number(s.consignmentCents) / 100)}</dd>
                <dt>Parcela do salão nas vendas</dt>
                <dd>
                  {money(
                    (Number(s.grossCents) - Number(s.consignmentCents)) / 100,
                  )}
                </dd>
                <dt>Compras de cortesias</dt>
                <dd>
                  {money(
                    (Number(s.periodDueCents) - Number(s.consignmentCents)) /
                      100,
                  )}
                </dd>
                <dt>Pagamentos registrados para o mês</dt>
                <dd>{money(Number(s.paidCents) / 100)}</dd>
              </dl>
              <div className="inventory-closing-balance">
                <span>
                  {Number(s.balanceCents) < 0
                    ? 'Crédito do salão'
                    : 'Saldo acumulado a pagar'}
                </span>
                <strong>{money(Math.abs(Number(s.balanceCents)) / 100)}</strong>
              </div>
              {s.unpaidItems > 0 && (
                <p className="booking-alert">
                  {s.unpaidItems} item(ns) aguardando pagamento da comanda, fora
                  dos valores de repasse.
                </p>
              )}
              <button onClick={() => setSettlement(s)}>
                Ver extrato e registrar pagamento
              </button>
            </article>
          ))}
        </div>
      )}
      <nav
        className="users-pagination"
        aria-label="Paginação de produtos e fornecedores"
      >
        <button
          disabled={loading || page === 0}
          onClick={() => {
            setPage(page - 1)
            setLoading(true)
          }}
        >
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button
          disabled={loading || !!error || !current?.hasNext}
          onClick={() => {
            setPage(page + 1)
            setLoading(true)
          }}
        >
          Próxima
        </button>
      </nav>
      {editor !== undefined && (
        <ProductEditor
          product={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined)
            refresh()
          }}
        />
      )}
      {supplierEditor !== undefined && (
        <SupplierEditor
          supplier={supplierEditor}
          onClose={() => setSupplierEditor(undefined)}
          onSaved={() => {
            setSupplierEditor(undefined)
            refresh()
          }}
        />
      )}
      {currentStock && (
        <StockModal
          product={currentStock}
          canStock={allowed(user, 'products.stock')}
          onClose={() => setStock(null)}
          onChanged={refresh}
        />
      )}
      {currentSettlement && (
        <SettlementModal
          supplier={currentSettlement}
          period={period}
          onClose={() => setSettlement(null)}
          onChanged={refresh}
        />
      )}
    </section>
  )
}
