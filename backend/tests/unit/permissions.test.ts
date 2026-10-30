import { describe, expect, it } from 'vitest'
import { hasPermission, isStaffScopedRole, permissionsForRole } from '../../src/lib/permissions.js'

describe('Permissions par rôle', () => {
  it('donne tous les droits métier et d’audit au Directeur', () => {
    expect(hasPermission('DIRECTOR', 'catalog:write')).toBe(true)
    expect(hasPermission('DIRECTOR', 'users:manage')).toBe(true)
    expect(hasPermission('DIRECTOR', 'payments:record')).toBe(true)
    expect(hasPermission('DIRECTOR', 'audit:read')).toBe(true)
    expect(hasPermission('DIRECTOR', 'infrastructure:read')).toBe(true)
    expect(hasPermission('DIRECTOR', 'technical-logs:read')).toBe(false)
    expect(hasPermission('DIRECTOR', 'settings:write')).toBe(true)
  })

  it('autorise l’informaticien (ADMIN) à gérer le personnel et l’infrastructure', () => {
    expect(hasPermission('ADMIN', 'audit:read')).toBe(true)
    expect(hasPermission('ADMIN', 'infrastructure:read')).toBe(true)
    expect(hasPermission('ADMIN', 'technical-logs:read')).toBe(true)
    expect(hasPermission('ADMIN', 'users:manage')).toBe(true)
    expect(hasPermission('ADMIN', 'catalog:read')).toBe(false)
    expect(hasPermission('ADMIN', 'catalog:write')).toBe(false)
    expect(hasPermission('ADMIN', 'orders:read')).toBe(false)
    expect(hasPermission('ADMIN', 'orders:confirm')).toBe(false)
    expect(hasPermission('ADMIN', 'payments:read')).toBe(false)
  })

  it('donne à l’agent commercial (COMMERCIAL) la confirmation, l’affectation et le retrait', () => {
    expect(hasPermission('COMMERCIAL', 'orders:confirm')).toBe(true)
    expect(hasPermission('COMMERCIAL', 'orders:assign')).toBe(true)
    expect(hasPermission('COMMERCIAL', 'orders:pickup')).toBe(true)
    expect(hasPermission('COMMERCIAL', 'users:manage')).toBe(false)
    expect(hasPermission('COMMERCIAL', 'catalog:write')).toBe(false)
  })

  it('réserve confirmation et affectation au Directeur et à l’agent commercial', () => {
    for (const role of ['TECHNICIAN', 'DELIVERY'] as const) {
      expect(hasPermission(role, 'orders:confirm')).toBe(false)
      expect(hasPermission(role, 'orders:assign')).toBe(false)
    }
    expect(hasPermission('DIRECTOR', 'orders:confirm')).toBe(true)
    expect(hasPermission('DIRECTOR', 'orders:assign')).toBe(true)
    expect(hasPermission('ADMIN', 'orders:confirm')).toBe(false)
    expect(hasPermission('ADMIN', 'orders:assign')).toBe(false)
  })

  it('donne au commercial les droits de confirmation et d’affectation sans gestion des comptes', () => {
    expect(hasPermission('COMMERCIAL', 'orders:confirm')).toBe(true)
    expect(hasPermission('COMMERCIAL', 'orders:assign')).toBe(true)
    expect(hasPermission('COMMERCIAL', 'users:manage')).toBe(false)
    expect(hasPermission('COMMERCIAL', 'catalog:write')).toBe(false)
  })

  it('limite le livreur à ses propres missions et conversations', () => {
    expect(hasPermission('DELIVERY', 'orders:read:own')).toBe(true)
    expect(hasPermission('DELIVERY', 'orders:update:own')).toBe(true)
    expect(hasPermission('DELIVERY', 'conversations:write')).toBe(true)
    expect(hasPermission('DELIVERY', 'catalog:write')).toBe(false)
    expect(hasPermission('DELIVERY', 'orders:confirm')).toBe(false)
    expect(hasPermission('DELIVERY', 'orders:assign')).toBe(false)
    expect(hasPermission('DELIVERY', 'payments:record')).toBe(false)
  })

  it('limite le technicien à ses propres missions et lui interdit l’encaissement', () => {
    expect(hasPermission('TECHNICIAN', 'orders:read:own')).toBe(true)
    expect(hasPermission('TECHNICIAN', 'orders:update:own')).toBe(true)
    expect(hasPermission('TECHNICIAN', 'orders:read')).toBe(false)
    expect(hasPermission('TECHNICIAN', 'orders:assign')).toBe(false)
    expect(hasPermission('TECHNICIAN', 'payments:record')).toBe(false)
  })

  it('identifie les rôles à périmètre restreint', () => {
    expect(isStaffScopedRole('TECHNICIAN')).toBe(true)
    expect(isStaffScopedRole('DELIVERY')).toBe(true)
    expect(isStaffScopedRole('COMMERCIAL')).toBe(false)
    expect(isStaffScopedRole('DIRECTOR')).toBe(false)
    expect(isStaffScopedRole('ADMIN')).toBe(false)
  })

  it('expose une liste de permissions sans doublon', () => {
    for (const role of ['DIRECTOR', 'ADMIN', 'COMMERCIAL', 'TECHNICIAN', 'DELIVERY'] as const) {
      const permissions = permissionsForRole(role)
      expect(new Set(permissions).size).toBe(permissions.length)
    }
  })
})
