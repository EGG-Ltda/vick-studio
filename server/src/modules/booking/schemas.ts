import z from 'zod'
import { PasswordSchema } from '@/core/user'

export function validCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false
  for (let length = 9; length <= 10; length++) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i)
    const digit = ((sum * 10) % 11) % 10
    if (digit !== Number(value[length])) return false
  }
  return true
}
export const CpfSchema = z
  .string()
  .transform((value) => value.replace(/[.\-\s]/g, ''))
  .refine(validCpf, 'Invalid CPF')
export const BirthDateSchema = z.iso
  .date()
  .refine(
    (value) =>
      value <=
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    'Birth date cannot be in the future',
  )
export const RegistrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3)
    .max(255)
    .refine((name) => name.split(/\s+/).length > 1, 'Full name is required'),
  birthDate: BirthDateSchema,
  cpf: CpfSchema,
  phone: z
    .string()
    .transform((value) => value.replace(/[()\-\s+]/g, ''))
    .pipe(z.string().regex(/^\d{10,13}$/)),
  email: z.email().trim().toLowerCase().max(255),
  password: PasswordSchema,
})
export const LoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(100),
})
export const SettingsSchema = z
  .object({
    enabled: z.boolean(),
    packageValidityMonths: z.number().int().min(1).max(24).default(1),
    depositDays: z.number().int().min(1).max(3),
    shortNoticeHours: z.number().int().min(1).max(24).default(2),
    depositType: z.enum(['percent', 'fixed']),
    depositValue: z.number().positive().max(99999),
    paymentInstructions: z.string().trim().max(2000),
  })
  .refine(
    (data) => data.depositType !== 'percent' || data.depositValue <= 100,
    'Invalid percentage',
  )
  .refine(
    (data) => !data.enabled || data.paymentInstructions.length >= 5,
    'Payment instructions are required',
  )
export const BookingSchema = z.object({
  employeeId: z.number().int().positive(),
  treatmentIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate treatments'),
  startsAt: z.iso.datetime({ offset: true }),
  requestKey: z.uuid(),
  // Reviewed price/conditions must still match when the reservation is committed.
  expectedTotal: z.number().nonnegative(),
  expectedDeposit: z.number().nonnegative(),
  expectedDeadline: z.iso.datetime({ offset: true }),
  expectedInstructions: z.string().max(2000),
})
export const StaffBookingSchema = BookingSchema.extend({
  customerId: z.number().int().positive(),
  depositDeadline: z.iso.datetime({ offset: true }),
})
export const EmployeeSchema = z
  .object({
    name: z.string().trim().min(3).max(255),
    cpf: CpfSchema,
    userId: z.number().int().positive(),
    active: z.boolean(),
    treatmentIds: z.array(z.number().int().positive()).max(100),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((data) => data.opensAt < data.closesAt, {
    message: 'Closing time must be later than opening time.',
    path: ['closesAt'],
  })

export function employeeValidationMessage(error: z.ZodError): string {
  const messages: Record<string, string> = {
    cpf: 'Invalid CPF. Enter a valid 11-digit CPF, including its check digits.',
    name: 'Employee name must contain between 3 and 255 characters.',
    userId: 'Select a salon user for this employee.',
    active: 'Select whether this employee is available for bookings.',
    treatmentIds: 'Select valid treatments for this employee.',
    weekdays: 'Select valid working days without duplicates.',
    opensAt: 'Opening time must use the HH:MM format.',
    closesAt:
      'Closing time must use the HH:MM format and be later than opening time.',
  }
  return [
    ...new Set(
      error.issues.map(
        (issue) => messages[String(issue.path[0])] ?? issue.message,
      ),
    ),
  ].join(' ')
}
