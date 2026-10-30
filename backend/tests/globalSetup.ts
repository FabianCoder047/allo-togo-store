import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import { PrismaClient } from '@prisma/client'
import {
  applyTestEnv,
  TEST_ADMIN,
  TEST_IT,
  TEST_DATABASE_URL,
  TEST_PUBLIC_DATABASE_URL,
  TEST_SCHEMA,
} from './helpers/testEnv.js'

const execFileAsync = promisify(execFile)
const backendRoot = fileURLToPath(new URL('..', import.meta.url))
const pgPort = Number(process.env.EMBEDDED_PG_PORT ?? 5433)
const pgUser = process.env.EMBEDDED_PG_USER ?? 'postgres'
const pgPassword = process.env.EMBEDDED_PG_PASSWORD ?? 'postgres'
const pgDatabase = process.env.EMBEDDED_PG_DATABASE ?? 'allotogo'

const isPortOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(1_500)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

const run = async (command: string, args: string[], env: NodeJS.ProcessEnv) => {
  await execFileAsync(command, args, {
    cwd: backendRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  })
}

/**
 * Prépare une base de test totalement isolée :
 * 1. démarre PostgreSQL embarqué si nécessaire ;
 * 2. supprime puis recrée le schéma `allotogo_test` ;
 * 3. applique le schéma Prisma ;
 * 4. exécute le seed (comptes de démonstration + catalogue).
 */
export default async function globalSetup() {
  applyTestEnv()

  let embedded: EmbeddedPostgres | null = null

  if (!(await isPortOpen(pgPort))) {
    const databaseDir = path.resolve(backendRoot, '.pgdata')
    embedded = new EmbeddedPostgres({
      databaseDir,
      port: pgPort,
      user: pgUser,
      password: pgPassword,
      persistent: true,
      onLog: () => undefined,
      onError: () => undefined,
    })
    if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
      await embedded.initialise()
    }
    await embedded.start()
    try {
      await embedded.createDatabase(pgDatabase)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.toLowerCase().includes('already exists')) throw error
    }
  }

  const admin = new PrismaClient({ datasourceUrl: TEST_PUBLIC_DATABASE_URL })
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
  } finally {
    await admin.$disconnect()
  }

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    SEED_ADMIN_EMAIL: TEST_ADMIN.email,
    SEED_ADMIN_PASSWORD: TEST_ADMIN.password,
    SEED_IT_ADMIN_EMAIL: TEST_IT.email,
    SEED_IT_ADMIN_PASSWORD: TEST_IT.password,
    SEED_IT_ADMIN_NAME: 'Yaovi Informaticien',
    SEED_DEMO_STAFF: 'true',
  }

  await run(path.join(backendRoot, 'node_modules', '.bin', 'prisma'), ['db', 'push', '--skip-generate', '--accept-data-loss'], env)
  await run(path.join(backendRoot, 'node_modules', '.bin', 'tsx'), ['prisma/seed.ts'], env)

  return async () => {
    if (embedded) {
      await embedded.stop().catch(() => undefined)
    }
  }
}
