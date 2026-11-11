import type { Dependency, Treatment } from '../../core/api/treatments'
import './dependencies.css'
export function DependencyEditor({
  value,
  onChange,
  treatments,
  editingId,
  disabled,
}: {
  value: Dependency[]
  onChange: (v: Dependency[]) => void
  treatments: Treatment[]
  editingId: number | null
  disabled: boolean
}) {
  const choices = treatments.filter((t) => t.id !== editingId),
    remaining = choices.filter(
      (t) => !value.some((d) => d.requiredTreatmentId === t.id),
    )
  function update(i: number, patch: Partial<Dependency>) {
    onChange(value.map((d, j) => (i === j ? { ...d, ...patch } : d)))
  }
  return (
    <fieldset disabled={disabled} className="dependency-editor">
      <legend>Procedimentos obrigatórios</legend>
      <p>
        Opcional. Cada procedimento terá sua própria reserva e poderá ser feito
        por outra profissional. Os intervalos são contados do término do
        anterior ao início do seguinte.
      </p>
      {value.map((d, i) => (
        <article className="dependency-rule" key={i}>
          <label>
            Serviço obrigatório
            <select
              value={d.requiredTreatmentId}
              onChange={(e) =>
                update(i, { requiredTreatmentId: Number(e.target.value) })
              }
            >
              {!choices.some((t) => t.id === d.requiredTreatmentId) && (
                <option value={d.requiredTreatmentId}>
                  Serviço #{d.requiredTreatmentId} (inativo ou não listado)
                </option>
              )}
              {choices
                .filter(
                  (t) =>
                    t.id === d.requiredTreatmentId ||
                    !value.some((x) => x.requiredTreatmentId === t.id),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {!t.isActive ? ' (inativo)' : ''}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Ordem
            <select
              value={d.position}
              onChange={(e) =>
                update(i, {
                  position: e.target.value as Dependency['position'],
                })
              }
            >
              <option value="before">Antes do serviço principal</option>
              <option value="after">Depois do serviço principal</option>
            </select>
          </label>
          <label>
            Datas
            <select
              value={String(d.sameDay)}
              onChange={(e) =>
                update(i, { sameDay: e.target.value === 'true' })
              }
            >
              <option value="true">Obrigatoriamente no mesmo dia</option>
              <option value="false">Permitir dias diferentes</option>
            </select>
          </label>
          <label className="dependency-checkbox">
            <input
              type="checkbox"
              checked={d.consecutive}
              onChange={(e) =>
                update(i, {
                  consecutive: e.target.checked,
                  ...(e.target.checked
                    ? { minMinutes: 0, maxMinutes: 0 }
                    : { maxMinutes: null }),
                })
              }
            />
            Exigir horários consecutivos
          </label>
          <div className="dependency-interval">
            <label>
              Intervalo mínimo (minutos)
              <input
                type="number"
                min="0"
                max="525600"
                required
                disabled={d.consecutive}
                value={d.minMinutes}
                onChange={(e) =>
                  update(i, { minMinutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Intervalo máximo (minutos)
              <input
                type="number"
                min={d.minMinutes}
                max="525600"
                placeholder="Sem limite"
                disabled={d.consecutive}
                value={d.maxMinutes ?? ''}
                onChange={(e) =>
                  update(i, {
                    maxMinutes:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            Remover dependência
          </button>
        </article>
      ))}
      <button
        type="button"
        disabled={!remaining.length || value.length >= 20}
        onClick={() =>
          onChange([
            ...value,
            {
              requiredTreatmentId: remaining[0].id,
              position: 'before',
              sameDay: true,
              consecutive: false,
              minMinutes: 0,
              maxMinutes: null,
            },
          ])
        }
      >
        ＋ Adicionar dependência
      </button>
      {!value.length && (
        <small>Este serviço não exige outros procedimentos.</small>
      )}
    </fieldset>
  )
}
