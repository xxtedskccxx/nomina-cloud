import { formatDateOnly } from '../common/dates/date-only.js'

export const employmentSelect = {
  id: true,
  employeeId: true,
  employmentType: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: { select: { id: true, code: true, name: true } },
      position: { select: { id: true, code: true, name: true } },
    },
  },
} as const

export function serializeEmployment<T extends Record<string, unknown>>(employment: T) {
  return {
    ...employment,
    startDate: formatDateOnly(employment.startDate as Date),
    endDate: employment.endDate ? formatDateOnly(employment.endDate as Date) : null,
    createdAt: (employment.createdAt as Date).toISOString(),
    updatedAt: (employment.updatedAt as Date).toISOString(),
  }
}
