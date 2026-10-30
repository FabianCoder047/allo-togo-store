import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setup.ts'],
    // Les tests d'intégration partagent une base PostgreSQL : exécution séquentielle.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
})
