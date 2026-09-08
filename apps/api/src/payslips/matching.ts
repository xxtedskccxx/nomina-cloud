import { sanitizeOriginalFileName } from './pdf-validation.js'

export type EmployeeCodeMatchMethod = 'EXACT' | 'NORMALIZED' | 'UNMATCHED'

export interface MatchableEmployee {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
}

export interface EmployeeFileMatch {
  employee: MatchableEmployee | null
  method: EmployeeCodeMatchMethod
  reviewReason: string | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function baseName(fileName: string): string {
  return sanitizeOriginalFileName(fileName)
    .replace(/\.pdf$/i, '')
    .toUpperCase()
}

function isDelimitedCode(fileName: string, employeeCode: string): boolean {
  const expression = new RegExp(
    `(^|[^A-Z0-9])${escapeRegExp(employeeCode.toUpperCase())}([^A-Z0-9]|$)`,
  )
  return expression.test(fileName)
}

function normalizedCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function matchEmployeeFromFileName(
  fileName: string,
  employees: readonly MatchableEmployee[],
): EmployeeFileMatch {
  const name = baseName(fileName)
  const exactMatches = employees.filter((employee) => isDelimitedCode(name, employee.employeeCode))
  const normalizedMatches = employees.filter((employee) => {
    const code = normalizedCode(employee.employeeCode)
    if (!code) return false
    return isDelimitedCode(name, code)
  })

  if (exactMatches.length === 1 && normalizedMatches.length <= 1) {
    return { employee: exactMatches[0]!, method: 'EXACT', reviewReason: null }
  }
  if (exactMatches.length > 1 || normalizedMatches.length > 1) {
    return { employee: null, method: 'UNMATCHED', reviewReason: 'Employee code is ambiguous' }
  }
  if (normalizedMatches.length === 1) {
    return { employee: normalizedMatches[0]!, method: 'NORMALIZED', reviewReason: null }
  }
  if (normalizedMatches.length > 1) {
    return { employee: null, method: 'UNMATCHED', reviewReason: 'Employee code is ambiguous' }
  }

  return {
    employee: null,
    method: 'UNMATCHED',
    reviewReason: 'Employee code was not found in the file name',
  }
}
