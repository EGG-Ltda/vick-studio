import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { SalonInput } from '../../components/selection/SalonInput'
import { SalonSelect } from '../../components/selection/SalonSelect'
import { accessRequest } from './accessApi'
import type { AccessClass, Capability } from './accessApi'
export function ClassEditor({
  id,
  catalog,
  creationPermissions,
  master,
  onClose,
  onSaved,
}: {
  id: number | 'new'
  catalog: Capability[]
  creationPermissions: AccessClass['permissions']
  master: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<AccessClass | null>(
      id === 'new'
        ? {
            id: 0,
            name: '',
            description: '',
            level: 'operational',
            dataScope: 'own',
            active: true,
            builtinRole: null,
            adminManageable: !master,
            version: 1,
            userCount: 0,
            editable: true,
            permissions: creationPermissions,
          }
        : null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [audit, setAudit] = useState<
      { id: number; author: string; action: string; createdAt: string }[]
    >([])
  useEffect(() => {
    if (id === 'new') return
    const c = new AbortController()
    accessRequest<AccessClass>(`/access/classes/${id}`, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setForm(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    accessRequest<typeof audit>(`/access/classes/${id}/audit`, {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setAudit(d)
      })
      .catch(() => {})
    return () => c.abort()
  }, [id])
  function eligible(c: Capability) {
    if (!form) return false
    if (form.dataScope === 'own') return c.operational
    if (form.builtinRole === 'OPERATIONAL') return c.operational
    return (
      form.level === 'administrative' ||
      (![
        'classes.manage',
        'staff.permissions',
        'users.passwords',
        'users.view',
      ].includes(c.key) &&
        (c.operational || form.dataScope === 'salon'))
    )
  }
  function toggle(
    key: string,
    field: 'allowed' | 'delegatable',
    value: boolean,
  ) {
    if (!form) return
    setError('')
    const next = form.permissions.map((g) => ({ ...g }))
    try {
      const ensure = (k: string) => {
        const grant = next.find((g) => g.key === k)!,
          cap = catalog.find((c) => c.key === k)!
        if (!eligible(cap) || (!master && !grant.editable))
          throw Error(
            'Esta permissão depende de uma funcionalidade protegida pelo Master.',
          )
        grant[field] = true
        for (const required of cap.requires) {
          const dep = next.find((g) => g.key === required)!
          if (!dep[field] && !(field === 'delegatable' && dep.allowed))
            ensure(required)
        }
      }
      if (value) ensure(key)
      else {
        next.find((g) => g.key === key)![field] = false
        let changed = true
        while (changed) {
          changed = false
          for (const cap of catalog) {
            const g = next.find((p) => p.key === cap.key)!
            if (
              g[field] &&
              cap.requires.some((k) => {
                const dep = next.find((p) => p.key === k)
                return field === 'allowed'
                  ? !dep?.allowed
                  : !dep?.allowed && !dep?.delegatable
              })
            ) {
              if (!master && !g.editable)
                throw Error(
                  'Uma ação protegida depende desta permissão. Solicite o ajuste ao Master.',
                )
              g[field] = false
              changed = true
            }
          }
        }
      }
      setForm({ ...form, permissions: next })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  function structure(change: Partial<AccessClass>) {
    if (!form) return
    const next = { ...form, ...change }
    setForm({
      ...next,
      permissions: next.permissions.map((g) => ({
        ...g,
        allowed: false,
        delegatable: false,
      })),
    })
    setError(
      'Ao alterar nível ou alcance, selecione novamente as permissões para confirmar os novos limites.',
    )
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError('')
    try {
      await accessRequest(
        id === 'new' ? '/access/classes' : `/access/classes/${id}`,
        {
          method: id === 'new' ? 'POST' : 'PUT',
          body: JSON.stringify({
            ...form,
            permissions: form.permissions.map(
              ({ key, allowed, delegatable }) => ({
                key,
                allowed,
                delegatable,
              }),
            ),
          }),
        },
      )
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save access class.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      size="wide"
      title={
        id === 'new' ? 'Nova classe de acesso' : `Classe ${form?.name ?? ''}`
      }
      description="Selecione as funcionalidades e os limites de acesso desta classe."
      busy={busy}
      onClose={onClose}
    >
      {!form && !error && <p role="status">Carregando classe…</p>}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {form && (
        <form className="access-view booking-form" onSubmit={save}>
          <fieldset disabled={busy || !form.editable}>
            <label>
              Nome da classe
              <SalonInput
                required
                minLength={2}
                maxLength={80}
                value={form.name}
                disabled={!!form.builtinRole && !master}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Descrição
              <textarea
                maxLength={1000}
                value={form.description}
                disabled={!!form.builtinRole && !master}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Nível de atuação
              <SalonSelect
                value={form.level}
                disabled={!master || !!form.builtinRole || form.userCount > 0}
                onChange={(e) =>
                  structure({ level: e.target.value as AccessClass['level'] })
                }
              >
                <option value="operational">Operacional · funcionário</option>
                <option value="administrative">Administrativo</option>
              </SalonSelect>
            </label>
            <label>
              Alcance dos dados
              <SalonSelect
                value={form.dataScope}
                disabled={!master}
                onChange={(e) =>
                  structure({
                    dataScope: e.target.value as AccessClass['dataScope'],
                  })
                }
              >
                <option value="own">Somente os próprios registros</option>
                <option value="salon">
                  Todos os registros autorizados do salão
                </option>
              </SalonSelect>
            </label>
            <p className="access-hint">
              O alcance não habilita telas ou ações. As funcionalidades abaixo
              também precisam estar autorizadas. Acesso ao salão inteiro é
              definido exclusivamente pelo Master.
            </p>
            {form.userCount > 0 && (
              <p className="booking-alert">
                Há {form.userCount} usuário(s) vinculado(s). Reatribua todos
                antes de desativar a classe ou alterar o nível.
              </p>
            )}
            <label className="booking-choice">
              <SalonInput
                type="checkbox"
                checked={form.active}
                disabled={
                  !!form.builtinRole || (form.userCount > 0 && form.active)
                }
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Classe ativa
            </label>
            {master && form.level === 'operational' && (
              <label className="booking-choice">
                <SalonInput
                  type="checkbox"
                  checked={form.adminManageable}
                  disabled={form.dataScope !== 'own'}
                  onChange={(e) =>
                    setForm({ ...form, adminManageable: e.target.checked })
                  }
                />
                Permitir que Admin autorizado gerencie esta classe
              </label>
            )}
            {[...new Set(catalog.map((c) => c.group))].map((group) => (
              <section className="access-group" key={group}>
                <h3>{group}</h3>
                {catalog
                  .filter((c) => c.group === group)
                  .map((c) => {
                    const g = form.permissions.find((p) => p.key === c.key)!
                    const disabled = !eligible(c) || (!master && !g.editable)
                    return (
                      <div className="access-row" key={c.key}>
                        <div>
                          <strong>{c.label}</strong>
                          {!eligible(c) && (
                            <small>Indisponível neste nível e alcance</small>
                          )}
                        </div>
                        <label>
                          <SalonInput
                            type="checkbox"
                            disabled={disabled}
                            checked={g.allowed}
                            aria-label={`${c.label}: habilitado`}
                            onChange={(e) =>
                              toggle(c.key, 'allowed', e.target.checked)
                            }
                          />
                          Habilitado
                        </label>
                        {master && form.builtinRole !== 'ADMIN' ? (
                          <label>
                            <SalonInput
                              type="checkbox"
                              disabled={!eligible(c)}
                              checked={g.delegatable}
                              aria-label={`${c.label}: delegar alteração ao Admin`}
                              onChange={(e) =>
                                toggle(c.key, 'delegatable', e.target.checked)
                              }
                            />
                            Delegar alteração ao Admin
                          </label>
                        ) : (
                          <small>
                            {g.delegatable
                              ? 'Dentro da delegação'
                              : 'Protegido pelo Master'}
                          </small>
                        )}
                      </div>
                    )
                  })}
              </section>
            ))}
          </fieldset>
          {form.editable && (
            <button className="primary-button" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar classe'}
            </button>
          )}
          {audit.length > 0 && (
            <details>
              <summary>Histórico de alterações</summary>
              {audit.map((a) => (
                <p key={a.id}>
                  {a.author} · {new Date(a.createdAt).toLocaleString('pt-BR')} ·{' '}
                  {a.action}
                </p>
              ))}
            </details>
          )}
        </form>
      )}
    </SalonModal>
  )
}
