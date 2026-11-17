// Standard deadlines are computed in the salon timezone by PostgreSQL.
export function customerDepositDeadline(
  start: Date,
  standard: Date,
  now: Date,
  hours: number,
) {
  if (start <= now)
    throw Object.assign(
      new Error('The appointment must start in the future.'),
      { statusCode: 409 },
    )
  const shortNotice = standard <= now
  const deadline = shortNotice
    ? new Date(Math.min(now.getTime() + hours * 3600000, start.getTime()))
    : standard
  return { deadline, shortNotice }
}
