import { useEffect, useState } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { allowed } from '../../core/auth/permissions'
import { accessRequest } from './accessApi'
import type { AccessClass, Capability } from './accessApi'
import { ClassEditor } from './ClassEditor'
import './access.css'
export default function ProfilesPage() {
  const { user, refreshAccess } = useAuth(),
    master = !!user?.isMaster,
    authorized =
      master || (user?.role === 'ADMIN' && allowed(user, 'staff.permissions'))
  const [data, setData] = useState<{
      items: AccessClass[]
      catalog: Capability[]
      creationPermissions: AccessClass['permissions']
      canCreate: boolean
    } | null>(null),
    [editing, setEditing] = useState<number | 'new' | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState('')
  useEffect(() => {
    if (!authorized) return
    const c = new AbortController()
    accessRequest<NonNullable<typeof data>>('/access/classes', {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) {
          setData(d)
          setError('')
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [authorized, revision])
  if (!authorized)
    return <p>Você não possui permissão para configurar acessos.</p>
  const classes = data?.items.filter((c) =>
    `${c.name} ${c.description}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  )
  return (
    <section className="dashboard-view access-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">Controle de acesso</span>
          <h1>Funcionalidades por perfil</h1>
          <p>
            Organize as classes de acesso, suas funcionalidades e o alcance dos
            dados.
          </p>
        </div>
        {data?.canCreate && (
          <button className="primary-button" onClick={() => setEditing('new')}>
            Nova classe
          </button>
        )}
      </header>
      <div className="access-master-note">
        <strong>Master mantém acesso completo.</strong>
        <p>
          O Master define os acessos e as delegações. O Admin gerencia apenas
          classes operacionais autorizadas, dentro dos limites definidos pelo
          Master. O nome da classe não concede permissões.
        </p>
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          <button onClick={() => setRevision((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="access-success">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Carregando classes…</p>}
      {data && (
        <>
          <label className="access-class-search">
            Buscar classe
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou descrição"
            />
          </label>
          <div className="access-class-grid">
            {classes?.map((c) => (
              <article className="access-class-card" key={c.id}>
                <header>
                  <h2>{c.name}</h2>
                  <span
                    className={`status-tag ${c.active ? 'status-active' : 'status-inactive'}`}
                  >
                    {c.active ? 'Ativa' : 'Inativa'}
                  </span>
                </header>
                <p>{c.description || 'Sem descrição.'}</p>
                <dl>
                  <dt>Nível de atuação</dt>
                  <dd>
                    {c.level === 'administrative'
                      ? 'Administrativo'
                      : 'Operacional'}
                  </dd>
                  <dt>Alcance dos dados</dt>
                  <dd>
                    {c.dataScope === 'salon'
                      ? 'Registros autorizados do salão'
                      : 'Somente os próprios registros'}
                  </dd>
                  <dt>Usuários vinculados</dt>
                  <dd>{c.userCount}</dd>
                </dl>
                {c.builtinRole && (
                  <small>
                    Classe original do sistema · usuários e exceções preservados
                  </small>
                )}
                {!c.editable && (
                  <small>Configuração protegida pelo Master</small>
                )}
                <button onClick={() => setEditing(c.id)}>
                  {c.editable ? 'Configurar classe' : 'Consultar classe'}
                </button>
              </article>
            ))}
          </div>
          {!classes?.length && <p>Nenhuma classe encontrada.</p>}
        </>
      )}
      {editing !== null && data && (
        <ClassEditor
          id={editing}
          catalog={data.catalog}
          creationPermissions={data.creationPermissions}
          master={master}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setRevision((n) => n + 1)
            setNotice(
              'Classe salva. Os acessos são reavaliados em cada solicitação, sem novo login.',
            )
            void refreshAccess()
          }}
        />
      )}
    </section>
  )
}
