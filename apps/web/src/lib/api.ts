export function apiUrl(path: string): string {
  const cleanPath = path.replace(/^\//, '')
  if (typeof window !== 'undefined') {
    return `/api-backend/${cleanPath}`
  }
  const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api').replace(
    /\/$/,
    '',
  )
  return `${apiBaseUrl}/${cleanPath}`
}

export interface ApiErrorShape {
  statusCode?: number
  code?: string
  message?: string
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
  })
  const payload = (await response.json().catch(() => null)) as T | ApiErrorShape | null
  if (!response.ok) {
    const error = payload as ApiErrorShape | null
    throw new ApiRequestError(
      response.status,
      error?.message ?? 'No pudimos completar la solicitud. Intenta nuevamente.',
      error?.code,
    )
  }
  return payload as T
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`
}

export function formatSpanishDate(value: string): string {
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

/*
Rango del período en una sola línea legible: "16 – 31 ago 2026" cuando
comparten mes, "28 ago – 3 sep 2026" cuando no. Un administrador
reconoce la quincena sin releer dos fechas completas.
*/
export function formatSpanishDateRange(start: string, end: string): string {
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`)
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`)
  const sameMonth =
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth()
  const startLabel = new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    ...(sameMonth ? {} : { month: 'short' as const }),
    timeZone: 'UTC',
  }).format(startDate)
  return `${startLabel} – ${formatSpanishDate(end)}`
}

/*
Momento exacto de un evento operativo ("Hoy, 10:42"). Los lotes y las
publicaciones se juzgan por cuán recientes son, no por su fecha larga.
*/
export function formatSpanishMoment(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const time = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit' }).format(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return `Hoy, ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `Ayer, ${time}`
  const day = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(date)
  return `${day}, ${time}`
}
