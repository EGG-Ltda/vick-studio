import { SalonInput } from '../../components/selection/SalonInput'
import { endOfLunch } from './availabilityApi'
import type { WorkingDay } from './availabilityApi'
export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WorkingDay[]
  onChange: (days: WorkingDay[]) => void
}) {
  function update(day: number, changes: Partial<WorkingDay>) {
    onChange(value.map((h) => (h.weekday === day ? { ...h, ...changes } : h)))
  }
  return (
    <fieldset className="employee-options-group availability-hours">
      <legend>Expediente e almoço · Brasília</legend>
      <p className="booking-note">
        Defina cada dia de trabalho. O almoço bloqueia uma hora e se repete
        semanalmente. Alterações com conflito de agendamento não serão salvas.
      </p>
      {[
        'Domingo',
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
        'Sábado',
      ].map((name, weekday) => {
        const day = value.find((h) => h.weekday === weekday)
        return (
          <div
            className={`availability-day${day ? ' is-enabled' : ''}`}
            key={name}
          >
            <label className="availability-check">
              <SalonInput
                type="checkbox"
                checked={!!day}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [
                          ...value,
                          {
                            weekday,
                            opensAt: '09:00',
                            closesAt: '18:00',
                            lunchStart: '12:00',
                          },
                        ].sort((a, b) => a.weekday - b.weekday)
                      : value.filter((h) => h.weekday !== weekday),
                  )
                }
              />
              {name}
            </label>
            {day && (
              <>
                <div className="availability-time-grid">
                  <label>
                    Entrada
                    <SalonInput
                      type="time"
                      required
                      value={day.opensAt}
                      onChange={(e) =>
                        update(weekday, { opensAt: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Saída
                    <SalonInput
                      type="time"
                      required
                      value={day.closesAt}
                      min={day.opensAt}
                      onChange={(e) =>
                        update(weekday, { closesAt: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Início do almoço
                    <SalonInput
                      type="time"
                      value={day.lunchStart ?? ''}
                      min={day.opensAt}
                      max={day.closesAt}
                      onChange={(e) =>
                        update(weekday, { lunchStart: e.target.value || null })
                      }
                    />
                  </label>
                </div>
                <small>
                  {day.lunchStart
                    ? `Almoço: ${day.lunchStart} às ${endOfLunch(day.lunchStart)}`
                    : 'Almoço ainda não configurado. Informe o início para bloquear o intervalo.'}
                </small>
              </>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
