import { UserRole } from '@payroll/contracts'
import { normalizeRole } from './roles.js'

describe('normalizeRole', () => {
  it('normalizes a supported role', () => {
    expect(normalizeRole('employee')).toBe(UserRole.EMPLOYEE)
  })

  it('reads the first role from Better Auth comma-separated storage', () => {
    expect(normalizeRole('ADMIN,EMPLOYEE')).toBe(UserRole.ADMIN)
  })

  it('rejects unknown and non-string values', () => {
    expect(normalizeRole('manager')).toBeNull()
    expect(normalizeRole(undefined)).toBeNull()
  })
})
