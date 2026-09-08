import { UserRole } from '@payroll/contracts'
import type { Role } from '@payroll/contracts'

export function normalizeRole(value: unknown): Role | null {
  if (typeof value !== 'string') {
    return null
  }

  const firstRole = value.split(',')[0]?.trim().toUpperCase()

  if (firstRole === UserRole.ADMIN || firstRole === UserRole.EMPLOYEE) {
    return firstRole
  }

  return null
}
