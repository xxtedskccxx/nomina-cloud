import { createAccessControl } from 'better-auth/plugins/access'
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access'

const statement = {
  ...defaultStatements,
  payrollPeriod: ['create', 'read', 'update', 'delete', 'publish'],
  payslip: ['read', 'download'],
} as const

export const accessControl = createAccessControl(statement)

export const adminRole = accessControl.newRole({
  ...adminAc.statements,
  payrollPeriod: ['create', 'read', 'update', 'delete', 'publish'],
  payslip: ['read', 'download'],
})

export const employeeRole = accessControl.newRole({
  payrollPeriod: ['read'],
  payslip: ['read', 'download'],
})
