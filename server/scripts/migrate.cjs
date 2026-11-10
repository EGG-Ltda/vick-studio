const { readdirSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

async function migrate() {
  if (!process.env.DATABASE_CONNECTION_STRING) {
    throw new Error(
      'Defina DATABASE_CONNECTION_STRING antes de executar as migrações.',
    )
  }
  const client = new Client({
    connectionString: process.env.DATABASE_CONNECTION_STRING,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(458123)')
    await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    const directory = path.resolve(__dirname, '../migrations')
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const applied = await client.query(
        'SELECT 1 FROM app_migrations WHERE name = $1',
        [name],
      )
      if (applied.rowCount) continue
      await client.query(readFileSync(path.join(directory, name), 'utf8'))
      await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [
        name,
      ])
      console.log(`Migração aplicada: ${name}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

migrate().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
