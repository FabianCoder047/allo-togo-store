import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email().max(160),
  // Les comptes créés par l’administration reçoivent un mot de passe
  // provisoire de 6 caractères, changé dès la première connexion.
  password: z.string().min(6).max(200),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
})

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
})

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire.').max(60, 'Le prénom est trop long.'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire.').max(60, 'Le nom est trop long.'),
  phone: z
    .string()
    .trim()
    .max(30, 'Le téléphone est trop long.')
    .regex(/^[0-9+().\s-]*$/, 'Numéro de téléphone invalide.')
    .optional()
    .or(z.literal(''))
    .nullable(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(200),
  newPassword: z
    .string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères.')
    .max(200)
    .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
    .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
    .regex(/[0-9]/, 'Le mot de passe doit contenir un chiffre.'),
})
