import { IGenericDatabaseClient } from '@/core/db'
import { bookingError } from '../booking/service'
export async function commissionPending(c: IGenericDatabaseClient, id: number) {
  return (
    await c.query(
      `SELECT st.employee_id AS "employeeId",p.name AS "employeeName",st.treatment_name AS name FROM salon_schedule_treatments st JOIN employees e ON e.id=st.employee_id JOIN persons p ON p.id=e.person_id LEFT JOIN employee_commission_rates r ON r.employee_id=st.employee_id AND r.treatment_id=st.treatment_id WHERE st.schedule_id=$1 AND (r.standard_percent IS NULL OR r.package_percent IS NULL) ORDER BY st.id`,
      [id],
    )
  ).rows
}
export async function assertCommissionRates(
  c: IGenericDatabaseClient,
  id: number,
) {
  await c.query('SELECT lock_commission_order($1)', [id])
  await c.query(
    'SELECT r.employee_id FROM employee_commission_rates r JOIN salon_schedule_treatments st ON st.employee_id=r.employee_id AND st.treatment_id=r.treatment_id WHERE st.schedule_id=$1 FOR SHARE OF r',
    [id],
  )
  if ((await commissionPending(c, id)).length)
    bookingError(
      'Configure the employee commission percentages before completing this appointment.',
      409,
    )
}
export async function lockCommissionEmployees(
  c: IGenericDatabaseClient,
  orderIds: (number | null)[],
) {
  const ids = (
    await c.query(
      'SELECT DISTINCT employee_id FROM salon_schedule_treatments WHERE schedule_id=ANY($1::int[]) ORDER BY employee_id',
      [orderIds],
    )
  ).rows
  for (const e of ids)
    await c.query('SELECT pg_advisory_xact_lock(70450,$1)', [e.employee_id])
}
