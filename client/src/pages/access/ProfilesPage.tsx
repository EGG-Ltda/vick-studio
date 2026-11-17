import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../core/auth/useAuth'
import { accessRequest } from './accessApi'
import type { Capability, Grant, Policy } from './accessApi'
import './access.css'
type Audit = {
  id: number
  action: string
  targetRole: string | null
  targetUserId: number | null
  author: string
  createdAt: string
}
export default function ProfilesPage() {
  const { user, refreshAccess } = useAuth(),
    [catalog, setCatalog] = useState<Capability[]>([]),
    [profiles, setProfiles] = useState<Policy[]>([]),
    [role, setRole] = useState<'ADMIN' | 'OPERATIONAL'>('ADMIN'),
    [grants, setGrants] = useState<Grant[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [audit, setAudit] = useState<Audit[]>([])
  useEffect(() => {
    if (!user?.isMaster) return
    const c = new AbortController()
    Promise.all([
      accessRequest<{ catalog: Capability[]; profiles: Policy[] }>(
        '/access/profiles',
        { signal: c.signal },
      ),
      accessRequest<Audit[]>('/access/audit', { signal: c.signal }),
    ])
      .then(([d, a]) => {
        if (!c.signal.aborted) {
          setCatalog(d.catalog)
          setProfiles(d.profiles)
          setGrants(
            d.profiles.find((p) => p.role === 'ADMIN')?.permissions ?? [],
          )
          setAudit(a)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [user?.isMaster])
  function toggle(
    key: string,
    field: 'allowed' | 'delegatable',
    value: boolean,
  ) {
    setNotice('')
    setGrants((previous) => {
      const next = previous.map((g) => ({ ...g })),
        changed = next.find((g) => g.key === key)!
      changed[field] = value
      function enableDependencies(k: string) {
        for (const required of catalog.find((c) => c.key === k)?.requires ??
          []) {
          const p = next.find((g) => g.key === required)!
          if (!p[field]) {
            p[field] = true
            enableDependencies(required)
          }
        }
      }
      if (value) enableDependencies(key)
      let changedAny = true
      while (changedAny) {
        changedAny = false
        for (const capability of catalog) {
          const g = next.find((g) => g.key === capability.key)!
          if (
            g.allowed &&
            capability.requires.some(
              (k) => !next.find((g) => g.key === k)?.allowed,
            )
          ) {
            g.allowed = false
            changedAny = true
          }
          if (
            g.delegatable &&
            capability.requires.some((k) => {
              const dep = next.find((g) => g.key === k)
              return !dep?.allowed && !dep?.delegatable
            })
          ) {
            g.delegatable = false
            changedAny = true
          }
        }
      }
      return next
    })
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const profile = profiles.find((p) => p.role === role)!
      await accessRequest(`/access/profiles/${role}`, {
        method: 'PUT',
        body: JSON.stringify({ version: profile.version, permissions: grants }),
      })
      const [d, a] = await Promise.all([
        accessRequest<{ profiles: Policy[] }>('/access/profiles'),
        accessRequest<Audit[]>('/access/audit'),
      ])
      setProfiles(d.profiles)
      setGrants(d.profiles.find((p) => p.role === role)!.permissions)
      setAudit(a)
      await refreshAccess()
      setNotice(
        'Perfil atualizado. Os acessos são reavaliados no backend a cada solicitação.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save profile.')
    } finally {
      setBusy(false)
    }
  }
  if (!user?.isMaster) return <p>Esta configuração é exclusiva do Master.</p>
  return (
    <section className="dashboard-view access-view">
      <header className="dashboard-view-header">
        <div>
          <span className="salon-eyebrow">
            Controle de acesso · exclusivo Master
          </span>
          <h1>Funcionalidades por perfil</h1>
          <p>
            Defina os acessos do salão e os limites que o Admin pode delegar à
            equipe.
          </p>
        </div>
      </header>
      <div className="access-master-note">
        <strong>Master mantém acesso completo.</strong>
        <p>
          Somente Master cria contas e atribui perfis. Admin ajusta apenas
          acessos individuais de usuários Operacionais, dentro dos limites
          abaixo e das próprias permissões. Desabilitados não acessam a
          aplicação.
        </p>
      </div>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="access-success">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando perfis…</p>
      ) : (
        <form onSubmit={save}>
          <div className="access-role-tabs" aria-label="Perfil em edição">
            {(['ADMIN', 'OPERATIONAL'] as const).map((r) => (
              <button
                type="button"
                key={r}
                disabled={busy}
                aria-pressed={role === r}
                onClick={() => {
                  setRole(r)
                  setGrants(
                    profiles.find((p) => p.role === r)?.permissions ?? [],
                  )
                  setNotice('')
                  setError('')
                }}
              >
                {r === 'ADMIN'
                  ? 'Admin · dona do salão'
                  : 'Operacional · funcionários'}
              </button>
            ))}
          </div>
          <p>
            {role === 'OPERATIONAL'
              ? 'As consultas operacionais ficam sempre limitadas aos próprios atendimentos, clientes e recebimentos. Habilitar uma tela não libera dados de outras profissionais.'
              : 'O Admin não pode criar usuários, alterar perfis ou acessar esta configuração.'}
          </p>
          <fieldset disabled={busy}>
            {[...new Set(catalog.map((c) => c.group))].map((group) => (
              <section className="access-group" key={group}>
                <h2>{group}</h2>
                {role === 'OPERATIONAL' && (
                  <p className="access-hint">
                    Padrão do perfil · Admin pode ajustar individualmente
                  </p>
                )}
                {catalog
                  .filter((c) => c.group === group)
                  .map((c) => {
                    const g = grants.find((g) => g.key === c.key)
                    if (!g) return null
                    const eligible = role === 'ADMIN' || c.operational
                    return (
                      <div
                        className={`access-row${role === 'ADMIN' ? ' access-row-single' : ''}`}
                        key={c.key}
                      >
                        <div>
                          <strong>{c.label}</strong>
                          {!eligible && <small>Restrito à administração</small>}
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Habilitar ${c.label}`}
                            checked={g.allowed}
                            disabled={!eligible}
                            onChange={(e) =>
                              toggle(c.key, 'allowed', e.target.checked)
                            }
                          />
                          <span>Habilitado</span>
                        </label>
                        {role === 'OPERATIONAL' && (
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Permitir que Admin ajuste ${c.label}`}
                              checked={g.delegatable}
                              disabled={!eligible}
                              onChange={(e) =>
                                toggle(c.key, 'delegatable', e.target.checked)
                              }
                            />
                            <span>Admin pode ajustar</span>
                          </label>
                        )}
                      </div>
                    )
                  })}
              </section>
            ))}
          </fieldset>
          <button className="primary-button" disabled={busy || !grants.length}>
            {busy ? 'Salvando…' : 'Salvar permissões do perfil'}
          </button>
        </form>
      )}
      <section className="access-audit">
        <h2>Alterações recentes de acesso</h2>
        {!audit.length ? (
          <p>Nenhuma alteração registrada.</p>
        ) : (
          <ul>
            {audit.slice(0, 20).map((a) => (
              <li key={a.id}>
                <strong>{a.author}</strong> ·{' '}
                {a.targetRole === 'ADMIN'
                  ? 'Perfil Admin'
                  : a.targetRole === 'OPERATIONAL'
                    ? 'Perfil Operacional'
                    : `Usuário #${a.targetUserId}`}
                <span>
                  {new Date(a.createdAt).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}{' '}
                  ·{' '}
                  {{
                    profile_permissions: 'Permissões do perfil',
                    user_permissions: 'Permissões individuais',
                    create_user: 'Criação de conta',
                    update_user_profile: 'Dados ou perfil alterados',
                    user_status: 'Status alterado',
                  }[a.action] ?? a.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
