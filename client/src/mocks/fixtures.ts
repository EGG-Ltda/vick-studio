// Frontend-only fixtures. No real person, credential, receipt or reservation.
export const demoPassword = 'demo12345'
export const permissionCatalog = [
  ['agenda.view', 'Agenda', 'Consultar agenda', true, []],
  ['agenda.create', 'Agenda', 'Criar agendamentos', true, ['agenda.view']],
  [
    'agenda.change',
    'Agenda',
    'Remarcar e cancelar',
    true,
    ['agenda.view', 'orders.view'],
  ],
  [
    'agenda.deposit',
    'Agenda',
    'Confirmar sinal',
    true,
    ['agenda.view', 'finance.view'],
  ],
  ['agenda.complete', 'Agenda', 'Concluir atendimento', true, ['orders.view']],
  ['orders.view', 'Comandas', 'Consultar comandas', true, []],
  [
    'orders.consumptions',
    'Comandas',
    'Registrar consumos',
    true,
    ['orders.view'],
  ],
  [
    'orders.notes',
    'Comandas',
    'Observações do atendimento',
    true,
    ['orders.view'],
  ],
  [
    'orders.payments',
    'Comandas',
    'Registrar recebimentos',
    true,
    ['orders.view', 'finance.view'],
  ],
  [
    'orders.refunds',
    'Comandas',
    'Estornos',
    false,
    ['orders.view', 'finance.view'],
  ],
  ['clients.view', 'Clientes', 'Consultar clientes', true, []],
  ['clients.edit', 'Clientes', 'Editar clientes', false, ['clients.view']],
  [
    'clients.notes',
    'Clientes',
    'Observações internas',
    false,
    ['clients.view'],
  ],
  [
    'clients.financial',
    'Clientes',
    'Valores dos clientes',
    true,
    ['clients.view', 'finance.view'],
  ],
  ['birthdays.view', 'Social', 'Aniversários', true, ['clients.view']],
  ['promotions.view', 'Social', 'Consultar promoções', false, []],
  [
    'promotions.manage',
    'Social',
    'Editar promoções',
    false,
    ['promotions.view', 'services.view'],
  ],
  [
    'packages.payments',
    'Social',
    'Recebimentos de pacotes',
    false,
    ['orders.view', 'finance.view'],
  ],
  [
    'finance.view',
    'Financeiro',
    'Consultar financeiro próprio ou do salão',
    true,
    [],
  ],
  [
    'finance.manage',
    'Financeiro',
    'Lançamentos gerais',
    false,
    ['finance.view'],
  ],
  ['employees.view', 'Funcionários', 'Consultar funcionários', false, []],
  [
    'employees.manage',
    'Funcionários',
    'Editar funcionários',
    false,
    ['employees.view'],
  ],
  ['services.view', 'Serviços', 'Consultar serviços', true, []],
  ['services.manage', 'Serviços', 'Editar serviços', false, ['services.view']],
  [
    'services.status',
    'Serviços',
    'Desabilitar serviços',
    false,
    ['services.view'],
  ],
  ['booking.settings', 'Configurações', 'Configurar agenda', false, []],
  ['users.view', 'Usuários', 'Consultar usuários', false, []],
  ['users.passwords', 'Usuários', 'Redefinir senhas', false, ['users.view']],
  [
    'staff.permissions',
    'Usuários',
    'Ajustar acessos individuais',
    false,
    ['users.view'],
  ],
] as const
export const catalog = permissionCatalog.map(
  ([key, group, label, operational, requires]) => ({
    key,
    group,
    label,
    operational,
    requires: [...requires],
  }),
)
export const masterKeys = [
  'profiles.manage',
  'users.create',
  'users.manage',
  'services.inactive',
]
export type Row = Record<string, any>
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export function day(offset = 0) {
  return new Date(Date.parse(today() + 'T12:00:00Z') + offset * 86400000)
    .toISOString()
    .slice(0, 10)
}
export const at = (offset: number, time: string) =>
  `${day(offset)}T${time}:00-03:00`
export function createFixtures() {
  const users: Row[] = [
    {
      id: 1,
      login: 'master.demo',
      email: 'master@demo.test',
      role: 'MASTER',
      isActive: true,
    },
    {
      id: 2,
      login: 'admin.demo',
      email: 'admin@demo.test',
      role: 'ADMIN',
      isActive: true,
    },
    {
      id: 3,
      login: 'carla.demo',
      email: 'carla@demo.test',
      role: 'OPERATIONAL',
      isActive: true,
    },
    {
      id: 4,
      login: 'fabi.demo',
      email: 'fabi@demo.test',
      role: 'OPERATIONAL',
      isActive: true,
    },
  ].map((u) => ({
    ...u,
    assignedRole: u.role,
    isMaster: u.role === 'MASTER',
    isAdmin: u.role !== 'OPERATIONAL',
    mustChangePassword: false,
    removedAt: null,
  }))
  const treatments: Row[] = [
    {
      id: 1,
      name: 'Unha em gel',
      description: 'Acabamento e cuidado para as unhas.',
      price: 100,
      durationMinutes: 60,
      isActive: true,
      dependencies: [
        {
          requiredTreatmentId: 2,
          position: 'before',
          sameDay: true,
          consecutive: false,
          minMinutes: 15,
          maxMinutes: 180,
        },
      ],
    },
    {
      id: 2,
      name: 'Manutenção',
      description: 'Preparação para o procedimento principal.',
      price: 45,
      durationMinutes: 30,
      isActive: true,
      dependencies: [],
    },
    {
      id: 3,
      name: 'Escova',
      description: 'Finalização para realçar o cabelo.',
      price: 80,
      durationMinutes: 45,
      isActive: true,
      dependencies: [],
    },
  ]
  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: '09:00',
    closesAt: '18:00',
  }))
  const employees: Row[] = [
    {
      id: 1,
      name: 'Carla · demonstração',
      userId: 3,
      email: 'carla@demo.test',
      cpf: '00000000000',
      active: true,
      treatmentIds: [2, 3],
      hours,
    },
    {
      id: 2,
      name: 'Fabi · demonstração',
      userId: 4,
      email: 'fabi@demo.test',
      cpf: '00000000000',
      active: true,
      treatmentIds: [1, 3],
      hours,
    },
  ]
  const customers: Row[] = [
    {
      id: 1,
      name: 'Cliente Aurora · demonstração',
      birthDate: '1995' + today().slice(4),
      cpf: '00000000000',
      email: 'cliente@demo.test',
      phone: '00000000000',
      createdAt: at(-60, '09:00'),
    },
    {
      id: 2,
      name: 'Cliente Bela · demonstração',
      birthDate: '1992' + today().slice(4, 7) + '-20',
      cpf: '11111111111',
      email: 'bela@demo.test',
      phone: '00000000000',
      createdAt: at(-30, '09:00'),
    },
  ]
  const orders: Row[] = [
    {
      id: 1,
      customerId: 1,
      employeeId: 1,
      treatmentIds: [2],
      startsAt: at(0, '10:00'),
      status: 'awaiting_deposit',
    },
    {
      id: 2,
      customerId: 2,
      employeeId: 2,
      treatmentIds: [3],
      startsAt: at(0, '14:00'),
      status: 'confirmed',
    },
    {
      id: 3,
      customerId: 1,
      employeeId: 1,
      treatmentIds: [3],
      startsAt: at(-2, '11:00'),
      status: 'completed',
    },
  ].map((o) => {
    const ts = treatments.filter((t) => o.treatmentIds.includes(t.id)),
      total = ts.reduce((s, t) => s + t.price, 0)
    return {
      ...o,
      endsAt: new Date(
        Date.parse(o.startsAt) +
          ts.reduce((s, t) => s + t.durationMinutes, 0) * 60000,
      ).toISOString(),
      treatments: ts.map((t) => ({ id: t.id, name: t.name, price: t.price })),
      totalPrice: total,
      depositRequired: Math.round(total * 30) / 100,
      depositReceived: o.status === 'awaiting_deposit' ? null : 24,
      depositDueAt: at(1, '18:00'),
      depositConfirmedAt:
        o.status === 'awaiting_deposit' ? null : at(-1, '09:00'),
      depositConfirmedBy: o.status === 'awaiting_deposit' ? null : 'admin.demo',
      paymentInstructions:
        'Demonstração: nenhum pagamento real deve ser realizado.',
      completedAt: o.status === 'completed' ? at(-2, '12:00') : null,
      cancelledAt: null,
      cancellationReason: null,
      groupId: null,
      packageUseId: null,
      packagePurchaseId: null,
    }
  })
  const profiles: Row[] = ['ADMIN', 'OPERATIONAL'].map((role) => ({
    role,
    version: 1,
    permissions: catalog.map((c) => ({
      key: c.key,
      allowed: role === 'ADMIN' || c.operational,
      delegatable: role === 'OPERATIONAL' && c.operational,
    })),
  }))
  const settings = {
    enabled: true,
    depositDays: 1,
    shortNoticeHours: 2,
    depositType: 'percent',
    depositValue: 30,
    paymentInstructions:
      'Demonstração: combine o sinal com a equipe. Nenhum pagamento é enviado.',
    timezone: 'America/Sao_Paulo',
    packageValidityMonths: 1,
  }
  const promotions: Row[] = [
    {
      id: 1,
      title: 'Seu momento de cuidado · demonstração',
      description:
        'Uma experiência de unhas e cabelo com horários escolhidos separadamente.',
      conditions: 'Oferta fictícia para apresentação do layout.',
      artId: 1,
      altText: 'Arte demonstrativa do pacote de cuidados',
      startsOn: day(-1),
      endsOn: day(30),
      active: true,
      price: 150,
      items: [
        {
          treatmentId: 2,
          quantity: 1,
          name: 'Manutenção',
          durationMinutes: 30,
          price: 45,
        },
        {
          treatmentId: 3,
          quantity: 1,
          name: 'Escova',
          durationMinutes: 45,
          price: 80,
        },
      ],
    },
  ]
  const payments: Row[] = [
    {
      id: 1,
      orderId: 3,
      kind: 'payment',
      amount: 80,
      description: 'Recebimento fictício',
      method: 'Pix · demonstração',
      createdAt: at(-2, '12:00'),
      isDebit: false,
      refundOf: null,
      refundedAmount: 0,
      packageReceiptId: null,
      author: 'admin.demo',
    },
  ]
  return {
    users,
    treatments,
    employees,
    customers,
    orders,
    profiles,
    settings,
    promotions,
    payments,
    notes: [] as Row[],
    extras: [] as Row[],
    changes: [] as Row[],
    groups: [] as Row[],
    purchases: [] as Row[],
    overrides: {} as Record<number, Row[]>,
    audit: [] as Row[],
    art: {} as Record<number, string>,
  }
}
