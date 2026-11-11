import type { AppUser } from './user'
import { MASTER_USER_ID } from './config'
export const permissionCatalog = [
  ['agenda.view', 'Agenda', 'Consultar agenda', true, []],
  ['agenda.create', 'Agenda', 'Criar agendamentos', true, ['agenda.view']],
  [
    'agenda.change',
    'Agenda',
    'Remarcar, cancelar e registrar faltas',
    true,
    ['agenda.view', 'orders.view'],
  ],
  [
    'agenda.deposit',
    'Agenda',
    'Confirmar sinal recebido',
    true,
    ['agenda.view', 'finance.view'],
  ],
  ['agenda.complete', 'Agenda', 'Concluir atendimentos', true, ['orders.view']],
  ['orders.view', 'Comandas', 'Consultar comandas', true, []],
  [
    'orders.consumptions',
    'Comandas',
    'Registrar e cancelar consumos',
    true,
    ['orders.view'],
  ],
  [
    'orders.notes',
    'Comandas',
    'Registrar observações do atendimento',
    true,
    ['orders.view'],
  ],
  [
    'orders.payments',
    'Comandas',
    'Registrar recebimentos individuais',
    true,
    ['orders.view', 'finance.view'],
  ],
  [
    'orders.refunds',
    'Comandas',
    'Registrar estornos individuais',
    false,
    ['orders.view', 'finance.view'],
  ],
  ['clients.view', 'Clientes', 'Consultar clientes e histórico', true, []],
  [
    'clients.edit',
    'Clientes',
    'Editar dados cadastrais',
    false,
    ['clients.view'],
  ],
  [
    'clients.notes',
    'Clientes',
    'Consultar e registrar observações gerais',
    false,
    ['clients.view'],
  ],
  [
    'clients.financial',
    'Clientes',
    'Consultar pagamentos e totais dos clientes',
    true,
    ['clients.view', 'finance.view'],
  ],
  [
    'birthdays.view',
    'Social',
    'Consultar aniversários e avisos',
    true,
    ['clients.view'],
  ],
  ['promotions.view', 'Social', 'Consultar campanhas e pacotes', false, []],
  [
    'promotions.manage',
    'Social',
    'Criar e editar campanhas e pacotes',
    false,
    ['promotions.view', 'services.view'],
  ],
  [
    'packages.payments',
    'Social',
    'Registrar recebimentos e estornos de pacotes',
    false,
    ['orders.view', 'finance.view'],
  ],
  [
    'finance.view',
    'Financeiro',
    'Consultar financeiro (operacional: somente próprio)',
    true,
    [],
  ],
  [
    'finance.manage',
    'Financeiro',
    'Registrar lançamentos gerais do salão',
    false,
    ['finance.view'],
  ],
  [
    'employees.view',
    'Funcionários',
    'Consultar funcionários e vínculos de acesso',
    false,
    [],
  ],
  [
    'employees.manage',
    'Funcionários',
    'Cadastrar e editar funcionários',
    false,
    ['employees.view'],
  ],
  ['services.view', 'Serviços', 'Consultar serviços ativos', true, []],
  [
    'services.manage',
    'Serviços',
    'Cadastrar e editar serviços',
    false,
    ['services.view'],
  ],
  [
    'services.status',
    'Serviços',
    'Ativar e desabilitar serviços',
    false,
    ['services.view'],
  ],
  [
    'booking.settings',
    'Configurações',
    'Configurar agenda, sinal e validade de pacotes',
    false,
    [],
  ],
  ['users.view', 'Usuários', 'Consultar usuários', false, []],
  [
    'users.passwords',
    'Usuários',
    'Redefinir senhas permitidas pela hierarquia',
    false,
    ['users.view'],
  ],
  [
    'staff.permissions',
    'Usuários',
    'Ajustar acessos de funcionários dentro dos limites',
    false,
    ['users.view'],
  ],
] as const
export const masterPermissions = [
  'profiles.manage',
  'users.create',
  'users.manage',
  'services.inactive',
]
export const allPermissionKeys = [
  ...permissionCatalog.map((p) => p[0]),
  ...masterPermissions,
]
export type Role = 'MASTER' | 'ADMIN' | 'OPERATIONAL'
export function isMaster(user: { id: number; role: string }) {
  return user.id === MASTER_USER_ID || user.role === 'MASTER'
}
export function salonWide(user: Pick<AppUser, 'id' | 'role'>) {
  return isMaster(user) || user.role === 'ADMIN'
}
export function can(
  user: Pick<AppUser, 'id' | 'role' | 'permissions'> | undefined,
  key: string,
) {
  return !!user && (isMaster(user) || user.permissions.includes(key))
}
export function roleCanHave(role: Role, key: string) {
  return (
    role === 'MASTER' ||
    permissionCatalog.some((p) => p[0] === key && (role === 'ADMIN' || p[3]))
  )
}
export function validateDependencies(keys: string[]) {
  return permissionCatalog
    .filter(
      (p) =>
        keys.includes(p[0]) &&
        p[4].some((required) => !keys.includes(required)),
    )
    .map((p) => p[0])
}
export function resolveDependencies(keys: string[]) {
  let invalid: string[] = validateDependencies(keys)
  while (invalid.length) {
    keys = keys.filter((k) => !invalid.includes(k))
    invalid = validateDependencies(keys)
  }
  return keys
}
export async function requireFreshMaster(
  client: import('./db').IGenericDatabaseClient,
  actor: AppUser,
) {
  const row = (
    await client.query(
      'SELECT role,is_active,removed_at,must_change_password,password_version FROM app_users WHERE id=$1',
      [actor.id],
    )
  ).rows[0]
  if (
    !row?.is_active ||
    row.removed_at ||
    row.must_change_password ||
    row.password_version !== actor.passwordVersion ||
    !isMaster({ id: actor.id, role: row.role })
  )
    throw Object.assign(
      new Error('Current MASTER authorization is required.'),
      { statusCode: 403 },
    )
}

// Allocates legacy shared orders using historical treatment prices.
export const receiptShare = `CASE WHEN $1::boolean THEN 1 ELSE COALESCE((SELECT sum(part.price) FROM salon_schedule_treatments part JOIN employees professional ON professional.id=part.employee_id WHERE part.schedule_id=s.id AND professional.user_id=$2 AND professional.is_active)/NULLIF((SELECT sum(part.price) FROM salon_schedule_treatments part WHERE part.schedule_id=s.id),0),0) END`
