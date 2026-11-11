# Vick Studio Server

## Finance module

Apply `db/migrations/002_finance.sql` after the initial database schema and before
starting this version. Back up existing databases first. The migration preserves
existing records and can be reapplied.

Set `MASTER_USER_ID` in the server environment. Other users require
`finance.read`, plus `finance.write` for entries and reversals or `finance.export`
for Excel downloads. Assign permissions through `app_user_permissions`.

The frontend module is available at `/dashboard/financeiro`. It reports explicitly
completed treatment items and registered product sales. Historical prices and
discounts are stored in integer cents. Discounts apply to individual items; split
any attendance-wide discount between those items before recording completion.
Reversals preserve audit history and exclude the original entry from totals.

Legacy appointments are not automatically marked as completed. Worked hours
require actual start/end timestamps. Payment receipts and balances are not
reported because legacy transactions do not provide reliable reconciliation.

## Finance integration tests

Install dependencies and run `npm run build`. To run the PostgreSQL integration
suite, set `FINANCE_TEST_DATABASE_URL` to an empty, disposable database named
`finance_test`, then run `npm run test:finance`. The suite refuses to overwrite
an existing schema and checks authorization, historical prices, filters,
pagination, reversals, product sales and Excel totals.
