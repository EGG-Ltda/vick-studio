const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('pg')
const { randomBytes } = require('crypto')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
test('customer ledger migration imports deposits once and preserves manual receipts without treating expenses as refunds', async () => {
  assert.ok(process.env.TEST_DATABASE_CONNECTION_STRING)
  const admin = new Client({
      connectionString: process.env.TEST_DATABASE_CONNECTION_STRING,
    }),
    name = 'customer_migration_' + randomBytes(8).toString('hex')
  const url = new URL(process.env.TEST_DATABASE_CONNECTION_STRING)
  url.pathname = '/' + name
  const db = new Client({ connectionString: url.toString() })
  let created = false
  await admin.connect()
  try {
    await admin.query('CREATE DATABASE "' + name + '"')
    created = true
    await db.connect()
    await db.query(
      fs.readFileSync(path.join(__dirname, '../../db/init.sql'), 'utf8'),
    )
    for (const name of [
      '001_temporary_password.sql',
      '002_online_booking.sql',
      '003_short_notice_deposit.sql',
    ])
      await db.query(
        fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8'),
      )
    await db.query(
      `INSERT INTO app_users(login,email,hash_password,is_active,created_at) VALUES('migration','migration@example.test',repeat('x',60),true,now()); INSERT INTO persons(name,cpf_cnpj,is_pj,created_at) VALUES('Pessoa Migração','52998224725',false,now()); INSERT INTO customers(person_id,created_at) VALUES(1,now()); INSERT INTO employees(person_id,user_id,created_at) VALUES(1,1,now()); INSERT INTO salon_treatments(name,description,price,duration_minutes,is_active,created_at) VALUES('Nome antigo','Teste',100,60,true,now()); INSERT INTO payment_methods(name,description,created_at) VALUES('Pix','Pix',now()); INSERT INTO transaction_types(name,description,created_at) VALUES('Atendimento','Atendimento',now()),('Compra de estoque','Estoque',now());`,
    )
    for (let i = 0; i < 3; i++) {
      const start = new Date(Date.now() - (10 + i) * 86400000)
      const order = (
        await db.query(
          `INSERT INTO salon_schedules(customer_id,schedule_started_at,schedule_ended_at,no_treatments,status,total_price,deposit_required,deposit_received,deposit_confirmed_at,deposit_confirmed_by,created_at) VALUES(1,$1::timestamptz,$1::timestamptz+interval '1 hour',1,'completed',100,30,30,now(),1,now()) RETURNING id`,
          [start],
        )
      ).rows[0]
      await db.query(
        'INSERT INTO salon_schedule_treatments(employee_id,schedule_id,treatment_id,price) VALUES(1,$1,1,100)',
        [order.id],
      )
      if (i > 0) {
        const tx = (
          await db.query(
            'INSERT INTO salon_transactions(method_id,type_id,is_debit,description,value,created_at) VALUES(1,$1,$2,$3,$4,now()) RETURNING id',
            [
              i === 1 ? 1 : 2,
              i === 2,
              i === 1 ? 'Pagamento manual' : 'Compra de produto',
              i === 1 ? 100 : 15,
            ],
          )
        ).rows[0]
        await db.query(
          'INSERT INTO salon_schedule_transactions(schedule_id,transaction_id,created_at) VALUES($1,$2,now())',
          [order.id, tx.id],
        )
      }
    }
    await db.query(
      fs.readFileSync(
        path.join(__dirname, '../migrations/004_customer_history_orders.sql'),
        'utf8',
      ),
    )
    const totals = (
      await db.query(
        `SELECT order_id,sum(CASE WHEN ledger_kind='refund' THEN -abs(value) ELSE abs(value) END)::float AS total,count(*)::int AS count FROM salon_transactions WHERE ledger_kind IS NOT NULL GROUP BY order_id ORDER BY order_id`,
      )
    ).rows
    assert.deepEqual(
      totals.map((row) => row.total),
      [30, 100, 30],
    )
    assert.deepEqual(
      totals.map((row) => row.count),
      [1, 1, 1],
    )
    assert.equal(
      (
        await db.query(
          "SELECT ledger_kind FROM salon_transactions WHERE description='Compra de produto'",
        )
      ).rows[0].ledger_kind,
      null,
    )
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS total FROM salon_schedules WHERE completed_at IS NOT NULL',
        )
      ).rows[0].total,
      3,
    )
    await db.query("UPDATE salon_treatments SET name='Nome novo',price=999")
    assert.equal(
      (
        await db.query(
          'SELECT treatment_name,price::float FROM salon_schedule_treatments ORDER BY id LIMIT 1',
        )
      ).rows[0].treatment_name,
      'Nome antigo',
    )
    await db.query(
      `CREATE TABLE app_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now()); INSERT INTO app_migrations(name) VALUES('001_temporary_password.sql'),('002_online_booking.sql'),('003_short_notice_deposit.sql'),('004_customer_history_orders.sql')`,
    )
    execFileSync(process.execPath, ['scripts/migrate.cjs'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_CONNECTION_STRING: url.toString() },
      stdio: 'pipe',
    })
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS total FROM salon_transactions WHERE ledger_kind='deposit'",
        )
      ).rows[0].total,
      2,
    )
  } finally {
    await db.end().catch(() => {})
    if (created) await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)')
    await admin.end()
  }
})
