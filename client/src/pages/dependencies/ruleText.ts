import type { Dependency } from '../../core/api/treatments'
export const ruleText = (
  r: Dependency & { mainName: string; requiredName: string },
) =>
  `${r.requiredName} ${r.position === 'before' ? 'antes de' : 'depois de'} ${r.mainName} · ${r.sameDay ? 'mesmo dia' : 'dias diferentes permitidos'}${r.consecutive ? ' · horários consecutivos' : ` · intervalo mínimo de ${r.minMinutes} min${r.maxMinutes === null ? '' : `, máximo de ${r.maxMinutes} min`}`}`
