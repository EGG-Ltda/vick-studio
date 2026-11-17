import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { SalonModal } from '../../components/SalonModal'
import { useAuth } from '../../core/auth/useAuth'
import { accessRequest } from './accessApi'
import type { IndividualAccess } from './accessApi'
import './access.css'
export function UserPermissionsModal({
  id,
  onClose,
  onSaved,
}: {
  id: number
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth(),
    [data, setData] = useState<IndividualAccess | null>(null),
    [changes, setChanges] = useState<Record<string, boolean | null>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    accessRequest<IndividualAccess>(`/access/users/${id}`, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [id])
  function choose(key: string, value: string) {
    if (!data) return
    const next = {
      ...changes,
      [key]: value === 'profile' ? null : value === 'true',
    }
    const grant = (k: string) => data.permissions.find((p) => p.key === k)
    const effective = (k: string) => {
      const p = grant(k)
      if (!p || (!p.allowed && !p.delegatable)) return false
      const choice =
        k in next ? next[k] : data.overrides.find((o) => o.key === k)?.allowed
      return choice ?? p.allowed
    }
    try {
      const ensure = (k: string) => {
        for (const required of data.catalog.find((c) => c.key === k)
          ?.requires ?? []) {
          if (!effective(required)) {
            if (!grant(required)?.editable)
              throw Error(
                'Esta ação depende de uma permissão protegida pelo Master. Solicite o ajuste do perfil.',
              )
            next[required] = true
            ensure(required)
          }
        }
      }
      if (effective(key)) ensure(key)
      let changed = true
      while (changed) {
        changed = false
        for (const c of data.catalog) {
          if (effective(c.key) && c.requires.some((k) => !effective(k))) {
            if (!grant(c.key)?.editable)
              throw Error(
                'Esta visualização é necessária para uma função protegida pelo Master. Solicite o ajuste do perfil.',
              )
            next[c.key] = false
            changed = true
          }
        }
      }
      setChanges(next)
      setError('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to adjust dependent permissions.',
      )
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    setError('')
    try {
      await accessRequest(`/access/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          profileVersion: data.profileVersion,
          changes: Object.entries(changes).map(([key, allowed]) => ({
            key,
            allowed,
          })),
        }),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save permissions.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <SalonModal
      title={data ? `Permissões · ${data.user.login}` : 'Permissões do usuário'}
      description={
        user?.isMaster
          ? 'Ajuste os acessos individuais dentro do perfil atribuído.'
          : 'Você pode ajustar somente funcionalidades liberadas pelo Master para a equipe.'
      }
      busy={busy}
      onClose={onClose}
    >
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando permissões…</p>}
      {data && (
        <form className="access-view" onSubmit={save}>
          <fieldset disabled={busy}>
            {[...new Set(data.catalog.map((c) => c.group))].map((group) => {
              const capabilities = data.catalog.filter(
                (c) =>
                  c.group === group &&
                  data.permissions.find((p) => p.key === c.key)?.editable,
              )
              if (!capabilities.length) return null
              return (
                <section className="access-group" key={group}>
                  <h3>{group}</h3>
                  {capabilities.map((c) => {
                    const grant = data.permissions.find(
                        (p) => p.key === c.key,
                      )!,
                      stored = data.overrides.find((o) => o.key === c.key),
                      value =
                        c.key in changes
                          ? changes[c.key]
                          : (stored?.allowed ?? null)
                    return (
                      <label className="access-individual-row" key={c.key}>
                        <span>{c.label}</span>
                        <select
                          value={value === null ? 'profile' : String(value)}
                          onChange={(e) => choose(c.key, e.target.value)}
                        >
                          <option value="profile">
                            Seguir perfil (
                            {grant.allowed ? 'habilitado' : 'desabilitado'})
                          </option>
                          <option value="true">Habilitar</option>
                          <option value="false">Bloquear</option>
                        </select>
                      </label>
                    )
                  })}
                </section>
              )
            })}
          </fieldset>
          <p className="access-hint">
            Consultas operacionais sempre respeitam o vínculo da profissional.
            Ações dependentes são ajustadas junto com suas visualizações. Opções
            não delegáveis ficam protegidas pelo Master.
          </p>
          <button
            className="primary-button"
            disabled={busy || !Object.keys(changes).length}
          >
            {busy ? 'Salvando…' : 'Salvar acessos do usuário'}
          </button>
        </form>
      )}
    </SalonModal>
  )
}
