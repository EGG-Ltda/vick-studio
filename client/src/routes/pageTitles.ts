import { routePaths } from './routePaths'

export const applicationName = 'Vick Florez'
const titles: Record<string, string> = {
  [routePaths.booking]: 'Agendar agora',
  '/agendar/reservar': 'Agendar atendimento',
  [routePaths.login]: 'Área do salão',
  [routePaths.changePassword]: 'Criar senha pessoal',
  [routePaths.dashboard]: 'Área do salão',
  [routePaths.schedule]: 'Agenda',
  [routePaths.users]: 'Usuários',
  [routePaths.permissions]: 'Funcionalidades por perfil',
  [routePaths.customers]: 'Clientes',
  [routePaths.birthdays]: 'Aniversariantes',
  [routePaths.promotions]: 'Promoções e pacotes',
  [routePaths.finance]: 'Financeiro',
  [routePaths.products]: 'Produtos',
  [routePaths.employees]: 'Funcionários',
  [routePaths.treatments]: 'Serviços',
  [routePaths.bookingSettings]: 'Configurações da agenda',
  '/dashboard/sem-acesso': 'Acesso restrito',
}

export function pageTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  const title = titles[path] ?? (/^\/dashboard\/clientes\/\d+$/.test(path) ? 'Detalhes do cliente' : undefined)
  return title ? `${title} | ${applicationName}` : applicationName
}
