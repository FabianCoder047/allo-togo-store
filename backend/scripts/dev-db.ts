import EmbeddedPostgres from 'embedded-postgres'
import fs from 'node:fs'
import path from 'node:path'

const databaseDir = path.resolve(process.cwd(), '.pgdata')
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433)
const user = process.env.EMBEDDED_PG_USER ?? 'postgres'
const password = process.env.EMBEDDED_PG_PASSWORD ?? 'postgres'
const database = process.env.EMBEDDED_PG_DATABASE ?? 'allotogo'

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  persistent: true,
  onLog: (message) => console.log(`[postgres] ${message}`),
  onError: (error) => console.error(`[postgres] ${String(error)}`),
})

const main = async () => {
  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log(`Initialisation du cluster PostgreSQL dans ${databaseDir}…`)
    await pg.initialise()
  }
  await pg.start()
  try {
    await pg.createDatabase(database)
    console.log(`Base « ${database} » créée.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('already exists')) {
      console.warn(`Création de la base ignorée : ${message}`)
    }
  }
  console.log(`PostgreSQL embarqué prêt sur postgresql://${user}:***@localhost:${port}/${database}`)
  console.log('Laissez ce processus actif pendant le développement. Ctrl+C pour arrêter.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

const shutdown = async () => {
  console.log('\nArrêt de PostgreSQL embarqué…')
  await pg.stop().catch(() => undefined)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
