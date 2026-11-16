import { IGenericDatabaseClient } from '@/core/db'
import { bookingError } from '../booking/service'
export async function lockOrderPackage(c: IGenericDatabaseClient, id: number) {
  await c.query(
    'SELECT p.id FROM package_purchases p JOIN package_uses u ON u.purchase_id=p.id JOIN salon_schedules s ON s.package_use_id=u.id WHERE s.id=$1 FOR UPDATE OF p',
    [id],
  )
}
export async function packagePayment(
  c: IGenericDatabaseClient,
  useId: number | null,
) {
  if (!useId) return null
  const p = (
    await c.query(
      `SELECT p.minimum_payment_percent::float AS percent,(ceil(p.price*p.minimum_payment_percent)/100)::float AS minimum,COALESCE((SELECT sum(CASE WHEN r.kind='refund' THEN -r.amount ELSE r.amount END) FROM package_receipts r WHERE r.purchase_id=p.id),0)::float AS paid FROM package_purchases p JOIN package_uses u ON u.purchase_id=p.id WHERE u.id=$1`,
      [useId],
    )
  ).rows[0]
  return p
    ? {
        ...p,
        configured: p.percent !== null,
        released: p.percent !== null && p.paid >= p.minimum,
      }
    : null
}
export async function requirePackagePayment(
  c: IGenericDatabaseClient,
  useId: number | null,
) {
  const p = await packagePayment(c, useId)
  if (p && !p.released)
    bookingError(
      p.percent === null
        ? 'Configure the package minimum payment before starting or completing appointments.'
        : 'Package minimum payment has not been received.',
      409,
    )
}
