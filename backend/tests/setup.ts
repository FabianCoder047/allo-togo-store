import { applyTestEnv } from './helpers/testEnv.js'

// Ce fichier est chargé par Vitest avant chaque fichier de test, donc avant
// l'évaluation des imports de `src/app.ts`.
applyTestEnv()
