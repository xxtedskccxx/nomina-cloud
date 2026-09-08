import { badRequest } from '../errors/domain-errors.js'

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDateOnly(value: string, fieldName: string): Date {
  const match = dateOnlyPattern.exec(value)
  if (!match) {
    throw badRequest('INVALID_DATE_FORMAT', `${fieldName} must use YYYY-MM-DD`)
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest('INVALID_DATE_FORMAT', `${fieldName} must be a valid calendar date`)
  }

  return date
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function addCalendarDays(value: Date, days: number): Date {
  const result = new Date(value.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function todayDateOnly(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
