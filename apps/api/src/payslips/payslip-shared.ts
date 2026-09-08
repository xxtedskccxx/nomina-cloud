import { Prisma } from '@payroll/database'
import { formatDateOnly } from '../common/dates/date-only.js'

export const employeeSummarySelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, code: true, name: true } },
} as const

export const periodSummarySelect = {
  id: true,
  code: true,
  startDate: true,
  endDate: true,
  paymentDate: true,
} as const

export const payslipSelect = {
  id: true,
  employeeId: true,
  payrollPeriodId: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
  checksum: true,
  status: true,
  matchStatus: true,
  matchMethod: true,
  reviewReason: true,
  uploadedAt: true,
  publishedAt: true,
  archivedAt: true,
  employee: { select: employeeSummarySelect },
  payrollPeriod: { select: periodSummarySelect },
} as const

export const periodSelect = {
  id: true,
  code: true,
  startDate: true,
  endDate: true,
  paymentDate: true,
  status: true,
} as const

export type PayslipRecord = Prisma.PayslipGetPayload<{ select: typeof payslipSelect }>

export type EmployeeSummary = Prisma.EmployeeGetPayload<{ select: typeof employeeSummarySelect }>

export function serializePayslip(payslip: PayslipRecord) {
  return {
    id: payslip.id,
    employeeId: payslip.employeeId,
    payrollPeriodId: payslip.payrollPeriodId,
    fileName: payslip.originalFileName,
    mimeType: payslip.mimeType,
    fileSize: payslip.fileSize,
    checksum: payslip.checksum,
    status: payslip.status,
    matchStatus: payslip.matchStatus,
    matchMethod: payslip.matchMethod,
    reviewReason: payslip.reviewReason,
    uploadedAt: payslip.uploadedAt.toISOString(),
    publishedAt: payslip.publishedAt?.toISOString() ?? null,
    archivedAt: payslip.archivedAt?.toISOString() ?? null,
    employee: payslip.employee,
    payrollPeriod: {
      ...payslip.payrollPeriod,
      startDate: formatDateOnly(payslip.payrollPeriod.startDate),
      endDate: formatDateOnly(payslip.payrollPeriod.endDate),
      paymentDate: formatDateOnly(payslip.payrollPeriod.paymentDate),
    },
  }
}
