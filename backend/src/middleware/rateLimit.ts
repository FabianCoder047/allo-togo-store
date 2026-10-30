import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

const skipInTest = () => env.isTest

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes. Réessayez dans une minute.' } },
})

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: skipInTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives de connexion. Réessayez plus tard.' } },
})

export const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de messages envoyés à l’assistant. Réessayez dans une minute.' },
  },
})

export const trackingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de consultations. Réessayez dans une minute.' } },
})

export const trackingAccessLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives de vérification. Réessayez plus tard.' },
  },
})

export const checkoutLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de commandes soumises. Réessayez plus tard.' } },
})
