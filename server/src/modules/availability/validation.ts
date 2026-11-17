import { IGenericDatabaseClient } from '@/core/db'

export async function validateUpcomingAvailability(
  c: IGenericDatabaseClient,
  employeeId: number,
) {
  const conflict = (
    await c.query(
      `SELECT DISTINCT s.id FROM salon_schedules s JOIN salon_schedule_treatments st ON st.schedule_id=s.id
 WHERE st.employee_id=$1 AND s.status NOT IN ('cancelled','completed') AND s.schedule_ended_at>clock_timestamp() AND (
 NOT EXISTS(SELECT 1 FROM employee_booking_hours h WHERE h.employee_id=$1 AND h.weekday=extract(dow FROM s.schedule_started_at AT TIME ZONE 'America/Sao_Paulo')
 AND (s.schedule_started_at AT TIME ZONE 'America/Sao_Paulo')::date=(s.schedule_ended_at AT TIME ZONE 'America/Sao_Paulo')::date
 AND h.opens_at<=(s.schedule_started_at AT TIME ZONE 'America/Sao_Paulo')::time AND h.closes_at>=(s.schedule_ended_at AT TIME ZONE 'America/Sao_Paulo')::time)
 OR EXISTS(SELECT 1 FROM employee_calendar_blocks($1,s.schedule_started_at,s.schedule_ended_at))) ORDER BY s.id LIMIT 10`,
      [employeeId],
    )
  ).rows
  if (conflict.length)
    throw Object.assign(
      new Error(
        'Working hours or blocks conflict with existing appointments: ' +
          conflict.map((r: { id: number }) => '#' + r.id).join(', ') +
          '. Reschedule them before confirming this change.',
      ),
      { statusCode: 409 },
    )
  const lunch = (
    await c.query(
      `SELECT r.id FROM employee_availability_requests r WHERE r.employee_id=$1 AND r.kind='lunch' AND r.status='approved' AND r.ends_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM employee_booking_hours h WHERE h.employee_id=$1 AND h.weekday=extract(dow FROM r.starts_at AT TIME ZONE 'America/Sao_Paulo') AND h.lunch_start IS NOT NULL
 AND h.opens_at<=(r.starts_at AT TIME ZONE 'America/Sao_Paulo')::time AND h.closes_at>=(r.ends_at AT TIME ZONE 'America/Sao_Paulo')::time) LIMIT 1`,
      [employeeId],
    )
  ).rows
  if (lunch.length)
    throw Object.assign(
      new Error(
        'Working hours conflict with an approved lunch change. Resolve that request first.',
      ),
      { statusCode: 409 },
    )
}
