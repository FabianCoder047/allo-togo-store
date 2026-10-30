import type { StaffRole } from '@prisma/client'

export type Permission =
  | 'dashboard:read'
  | 'catalog:read'
  | 'catalog:write'
  | 'orders:read'
  | 'orders:confirm'
  | 'orders:assign'
  | 'orders:status'
  | 'orders:pickup'
  | 'orders:note'
  | 'orders:read:own'
  | 'orders:update:own'
  | 'payments:read'
  | 'payments:record'
  | 'quotes:read'
  | 'quotes:write'
  | 'users:manage'
  | 'notifications:manage'
  | 'audit:read'
  | 'infrastructure:read'
  | 'technical-logs:read'
  | 'settings:write'
  | 'conversations:read'
  | 'conversations:write'

/**
 * `DIRECTOR` pilote l'activité et les comptes. `ADMIN` est le rôle technique
 * de l'informaticien : il gère les comptes du personnel et suit
 * l'infrastructure, l'audit et l'affluence sans intervenir sur les commandes,
 * le catalogue ni les encaissements.
 * `COMMERCIAL` est l'agent commercial. `EMPLOYEE` assure l'accueil en agence.
 */
const rolePermissions: Record<StaffRole, Permission[]> = {
  DIRECTOR: [
    'dashboard:read',
    'catalog:read',
    'catalog:write',
    'orders:read',
    'orders:confirm',
    'orders:assign',
    'orders:status',
    'orders:pickup',
    'orders:note',
    'orders:read:own',
    'orders:update:own',
    'payments:read',
    'payments:record',
    'quotes:read',
    'quotes:write',
    'users:manage',
    'notifications:manage',
    'audit:read',
    'infrastructure:read',
    'settings:write',
    'conversations:read',
    'conversations:write',
  ],
  ADMIN: ['users:manage', 'audit:read', 'infrastructure:read', 'technical-logs:read'],
  EMPLOYEE: [
    'dashboard:read',
    'catalog:read',
    'orders:read',
    'orders:pickup',
    'orders:note',
    'payments:read',
    'payments:record',
    'quotes:read',
    'quotes:write',
    'conversations:read',
    'conversations:write',
  ],
  COMMERCIAL: [
    'dashboard:read',
    'catalog:read',
    'orders:read',
    'orders:confirm',
    'orders:assign',
    'orders:status',
    'orders:pickup',
    'orders:note',
    'payments:read',
    'payments:record',
    'quotes:read',
    'quotes:write',
    'conversations:read',
    'conversations:write',
  ],
  TECHNICIAN: ['orders:read:own', 'orders:update:own', 'conversations:read', 'conversations:write'],
  DELIVERY: ['orders:read:own', 'orders:update:own', 'conversations:read', 'conversations:write'],
}

export const permissionsForRole = (role: StaffRole): Permission[] => rolePermissions[role] ?? []

export const hasPermission = (role: StaffRole, permission: Permission) =>
  permissionsForRole(role).includes(permission)

export const isStaffScopedRole = (role: StaffRole) => role === 'TECHNICIAN' || role === 'DELIVERY'
