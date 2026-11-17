import type { Dependency } from '../../core/api/treatments'
export const ruleText = (
  r: Dependency & { mainName: string; requiredName: string },
) =>
  `${r.requiredName} ${r.position === 'before' ? 'antes de' : 'depois de'} ${r.mainName} · ${r.sameDay ? 'no mesmo dia' : 'pode ser em dias diferentes'}${r.consecutive || r.maxMinutes === 0 ? ' · um atendimento logo após o outro' : `${r.minMinutes > 0 ? ` · aguarde pelo menos ${r.minMinutes} min entre os atendimentos` : ''}${r.maxMinutes === null ? '' : ` · no máximo ${r.maxMinutes} min entre os atendimentos`}`}`
