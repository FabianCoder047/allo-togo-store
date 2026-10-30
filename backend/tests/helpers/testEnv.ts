/**
 * Environnement isolé des tests automatisés.
 *
 * Les tests utilisent un schéma PostgreSQL dédié (`allotogo_test`) créé dans
 * la même instance que le développement. Le schéma `public` n'est jamais
 * modifié par la suite de tests.
 */
export const TEST_SCHEMA = process.env.TEST_DATABASE_SCHEMA ?? 'allotogo_test'

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/allotogo?schema=allotogo_test'

export const TEST_DATABASE_URL = baseDatabaseUrl.includes('schema=')
  ? baseDatabaseUrl
  : `${baseDatabaseUrl}${baseDatabaseUrl.includes('?') ? '&' : '?'}schema=${TEST_SCHEMA}`

export const TEST_PUBLIC_DATABASE_URL = TEST_DATABASE_URL.replace(
  /([?&])schema=[^&]*/,
  '$1schema=public',
)

export const TEST_ADMIN = {
  email: 'admin@allotogo.test',
  password: 'AdminAlloTogo!2026',
}

export const TEST_IT = {
  email: 'it@allotogo.test',
  password: 'InfoAlloTogo!2026',
}

export const TEST_STAFF = {
  commercial: { email: 'commercial@allotogo.test', password: 'CommercialAlloTogo!2026' },
  technician: { email: 'technicien@allotogo.test', password: 'TechnicienAlloTogo!2026' },
  delivery: { email: 'livreur@allotogo.test', password: 'LivreurAlloTogo!2026' },
}

/**
 * Doit être appelé avant l'import de `src/app.ts` (qui charge `src/config/env.ts`).
 * `dotenv` ne remplace jamais une variable déjà définie : ces valeurs gagnent
 * donc sur le fichier `backend/.env`.
 */
export const applyTestEnv = () => {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.DIRECT_URL = TEST_DATABASE_URL
  process.env.PORT = process.env.PORT ?? '4100'
  process.env.PUBLIC_APP_URL = 'http://localhost:8443'
  process.env.CORS_ORIGINS = 'http://localhost:8443'
  process.env.LOG_LEVEL = 'silent'

  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-allo-togo-store-0123456789abcdef'
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-allo-togo-store-0123456789abcdef'
  process.env.JWT_ACCESS_TTL = '1h'
  process.env.JWT_REFRESH_TTL_DAYS = '7'
  process.env.BCRYPT_ROUNDS = '10'

  process.env.SEED_ADMIN_EMAIL = TEST_ADMIN.email
  process.env.SEED_ADMIN_PASSWORD = TEST_ADMIN.password
  process.env.SEED_ADMIN_NAME = 'Directeur Allo Togo'
  process.env.SEED_IT_ADMIN_EMAIL = TEST_IT.email
  process.env.SEED_IT_ADMIN_PASSWORD = TEST_IT.password
  process.env.SEED_IT_ADMIN_NAME = 'Yaovi Informaticien'
  process.env.SEED_DEMO_STAFF = 'true'

  process.env.WHATSAPP_PROVIDER = 'simulated'
  process.env.WHATSAPP_SIMULATION = 'true'

  // Utilisation du fournisseur SMTP réel en test (nécessite MAIL_USERNAME)
  process.env.EMAIL_PROVIDER = 'smtp'

  process.env.BICTORYS_ENABLED = 'true'
  process.env.BICTORYS_MODE = 'test'
  process.env.BICTORYS_MOCK = 'true'
  process.env.BICTORYS_WEBHOOK_SECRET = 'test-bictorys-webhook-secret'
  process.env.BICTORYS_SIGNATURE_HEADER = 'x-bictorys-signature'

  process.env.DELIVERY_FEE_FCFA = '0'
  process.env.DELIVERY_CAN_RECORD_PAYMENT = 'false'
  process.env.TRACKING_ACCESS_TTL_HOURS = '24'
  process.env.TRACKING_LOOKUP_MAX_ATTEMPTS = '10'
}
