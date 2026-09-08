/*
Traducción de estado del sistema a significado humano.

El backend sigue siendo la fuente de verdad: aquí no se inventa estado
de negocio, solo se derivan lecturas de lo que ya devuelven
GET /payroll-periods/:id/payslips (summary) y
GET /payslip-upload-batches/:id (summary + items).
*/

import type { Tone } from '@/components/ui/primitives'
import type {
  PayrollPeriod,
  PayslipPeriodSummary,
  PayslipUploadBatch,
  PayslipUploadBatchItem,
  PayslipUploadBatchSummary,
} from './payslip-types'

/* ---------------------------------------------------------------
   Cobertura del período
   --------------------------------------------------------------- */

export interface Coverage {
  expected: number
  covered: number
  missing: number
  published: number
  ready: number
  needsReview: number
  percent: number
  isComplete: boolean
}

export function deriveCoverage(summary: PayslipPeriodSummary): Coverage {
  const expected = Math.max(summary.expected, 0)
  const covered = Math.max(summary.uploaded, 0)
  const needsReview = Math.max(summary.needsReview, 0)
  const ready = Math.max(summary.draft - needsReview, 0)
  return {
    expected,
    covered,
    missing: Math.max(summary.missing, 0),
    published: Math.max(summary.published, 0),
    ready,
    needsReview,
    percent: expected === 0 ? 0 : Math.round((covered / expected) * 1000) / 10,
    isComplete: expected > 0 && summary.missing === 0,
  }
}

/* ---------------------------------------------------------------
   Excepciones del batch activo
   --------------------------------------------------------------- */

export const attentionItemStatuses = ['NEEDS_REVIEW', 'DUPLICATE', 'INVALID', 'FAILED'] as const

export type AttentionKind = (typeof attentionItemStatuses)[number]

export function attentionItems(batch: PayslipUploadBatch | null): PayslipUploadBatchItem[] {
  return (batch?.items ?? []).filter((item) =>
    (attentionItemStatuses as readonly string[]).includes(item.status),
  )
}

export function countByKind(items: PayslipUploadBatchItem[]): Record<AttentionKind, number> {
  return {
    NEEDS_REVIEW: items.filter((item) => item.status === 'NEEDS_REVIEW').length,
    DUPLICATE: items.filter((item) => item.status === 'DUPLICATE').length,
    INVALID: items.filter((item) => item.status === 'INVALID').length,
    FAILED: items.filter((item) => item.status === 'FAILED').length,
  }
}

/* ---------------------------------------------------------------
   ¿Puedo publicar?
   --------------------------------------------------------------- */

export interface ReadinessCheck {
  id: string
  tone: 'ok' | 'warn' | 'risk'
  label: string
}

export interface PublishReadiness {
  readyCount: number
  canPublish: boolean
  checks: ReadinessCheck[]
}

export function derivePublishReadiness({
  coverage,
  batchSummary,
  attentionCount,
  periodLocked,
}: {
  coverage: Coverage
  batchSummary: PayslipUploadBatchSummary | null
  attentionCount: number
  periodLocked: boolean
}): PublishReadiness {
  /*
  Publicar la tanda activa cubre el caso normal. Pero si esa tanda ya no
  tiene nada listo y el período aún guarda borradores de tandas
  anteriores, esos también se pueden publicar: contarlos evita
  deshabilitar el botón sobre una acción que sí es posible.
  */
  const readyCount =
    batchSummary && batchSummary.readyFiles > 0 ? batchSummary.readyFiles : coverage.ready
  const checks: ReadinessCheck[] = []

  checks.push(
    readyCount > 0
      ? {
          id: 'ready',
          tone: 'ok',
          label: `${readyCount} ${plural(readyCount, 'volante listo', 'volantes listos')} para publicar`,
        }
      : { id: 'ready', tone: 'warn', label: 'Todavía no hay volantes listos para publicar' },
  )

  checks.push(
    attentionCount === 0
      ? { id: 'exceptions', tone: 'ok', label: 'Ningún archivo requiere revisión' }
      : {
          id: 'exceptions',
          tone: 'warn',
          label: `${attentionCount} ${plural(attentionCount, 'archivo requiere', 'archivos requieren')} revisión`,
        },
  )

  checks.push(
    coverage.missing === 0
      ? {
          id: 'coverage',
          tone: 'ok',
          label:
            coverage.expected > 0
              ? `Los ${coverage.expected} empleados del período tienen volante`
              : 'Sin empleados pendientes',
        }
      : {
          id: 'coverage',
          tone: 'warn',
          label: `${coverage.missing} ${plural(coverage.missing, 'empleado se quedará', 'empleados se quedarán')} sin volante`,
        },
  )

  if (periodLocked) {
    checks.push({
      id: 'locked',
      tone: 'risk',
      label: 'El período está bloqueado y no admite cambios',
    })
  }

  return { readyCount, canPublish: readyCount > 0 && !periodLocked, checks }
}

/* ---------------------------------------------------------------
   Siguiente paso sugerido
   --------------------------------------------------------------- */

export type NextStepAction = 'select-period' | 'upload' | 'review' | 'publish' | 'none'

export interface NextStep {
  tone: Tone
  title: string
  detail: string
  action: NextStepAction
  actionLabel?: string
}

export function deriveNextStep({
  hasPeriod,
  periodLocked,
  coverage,
  attentionCount,
  readyCount,
  hasAnyPayslip,
}: {
  hasPeriod: boolean
  periodLocked: boolean
  coverage: Coverage
  attentionCount: number
  readyCount: number
  hasAnyPayslip: boolean
}): NextStep {
  if (!hasPeriod) {
    return {
      tone: 'info',
      title: 'Elige un período de nómina',
      detail: 'Todo lo que subas y publiques queda dentro del período seleccionado.',
      action: 'select-period',
    }
  }
  if (periodLocked) {
    return {
      tone: 'neutral',
      title: 'Este período está bloqueado',
      detail: 'No admite nuevas cargas ni publicaciones.',
      action: 'none',
    }
  }
  if (!hasAnyPayslip) {
    return {
      tone: 'info',
      title: 'Sube los PDFs del período',
      detail: 'Arrastra los volantes que generó tu sistema de nómina. Nosotros los asignamos.',
      action: 'upload',
      actionLabel: 'Ir a la carga',
    }
  }
  if (attentionCount > 0) {
    return {
      tone: 'warn',
      title: `${attentionCount} ${plural(attentionCount, 'archivo necesita', 'archivos necesitan')} tu atención`,
      detail: 'El resto ya quedó guardado. Trabaja solo esa lista antes de publicar.',
      action: 'review',
      actionLabel: 'Revisar ahora',
    }
  }
  if (readyCount > 0) {
    return {
      tone: 'ok',
      title: `${readyCount} ${plural(readyCount, 'volante listo', 'volantes listos')} para publicar`,
      detail:
        coverage.missing > 0
          ? `${coverage.missing} ${plural(coverage.missing, 'empleado seguirá', 'empleados seguirán')} sin volante después de publicar.`
          : 'Al publicar, cada empleado podrá ver y descargar su volante.',
      action: 'publish',
      actionLabel: 'Publicar',
    }
  }
  if (coverage.missing > 0) {
    return {
      tone: 'warn',
      title: `Faltan ${coverage.missing} ${plural(coverage.missing, 'volante', 'volantes')}`,
      detail: 'Sube los PDFs de los empleados pendientes para cerrar el período.',
      action: 'upload',
      actionLabel: 'Subir los que faltan',
    }
  }
  return {
    tone: 'ok',
    title: 'Período completo',
    detail: `Los ${coverage.expected} empleados del período pueden ver su volante.`,
    action: 'none',
  }
}

/* ---------------------------------------------------------------
   Etiquetas
   --------------------------------------------------------------- */

export function periodStatusLabel(status: PayrollPeriod['status']): { label: string; tone: Tone } {
  switch (status) {
    case 'OPEN':
      return { label: 'Abierto', tone: 'info' }
    case 'LOCKED':
      return { label: 'Bloqueado', tone: 'neutral' }
    default:
      return { label: 'Borrador', tone: 'neutral' }
  }
}

export function batchStatusLabel(status: PayslipUploadBatch['status']): {
  label: string
  tone: Tone
} {
  switch (status) {
    case 'PROCESSING':
      return { label: 'Procesando', tone: 'neutral' }
    case 'NEEDS_REVIEW':
      return { label: 'Necesita revisión', tone: 'warn' }
    case 'READY':
      return { label: 'Listo para publicar', tone: 'ok' }
    case 'COMPLETED':
      return { label: 'Publicado', tone: 'ok' }
    case 'PARTIAL':
      return { label: 'Con pendientes', tone: 'warn' }
    default:
      return { label: 'Falló', tone: 'risk' }
  }
}

export function itemStatusLabel(status: PayslipUploadBatchItem['status']): {
  label: string
  tone: Tone
  help: string
} {
  switch (status) {
    case 'PROCESSING':
      return { label: 'Procesando', tone: 'neutral', help: 'Estamos leyendo el archivo.' }
    case 'COMPLETED':
      return { label: 'Asignado', tone: 'ok', help: 'El volante quedó asociado a su empleado.' }
    case 'NEEDS_REVIEW':
      return {
        label: 'Sin identificar',
        tone: 'warn',
        help: 'No pudimos reconocer a qué empleado pertenece este PDF.',
      }
    case 'DUPLICATE':
      return {
        label: 'Posible duplicado',
        tone: 'warn',
        help: 'Ya existe un volante para este empleado en este período.',
      }
    case 'INVALID':
      return {
        label: 'PDF inválido',
        tone: 'risk',
        help: 'El archivo no es un PDF legible. Vuelve a generarlo desde tu sistema de nómina.',
      }
    case 'FAILED':
      return {
        label: 'Falló la carga',
        tone: 'risk',
        help: 'La subida se interrumpió. Puedes reintentarla sin volver a elegir el archivo.',
      }
    default:
      return { label: 'Omitido', tone: 'neutral', help: 'Este archivo se descartó a propósito.' }
  }
}

export function matchMethodLabel(method: PayslipUploadBatchItem['matchMethod']): string {
  switch (method) {
    case 'EXACT':
      return 'Asignado por código exacto'
    case 'NORMALIZED':
      return 'Asignado por código normalizado'
    case 'MANUAL':
      return 'Asignado a mano'
    default:
      return 'Sin asignar'
  }
}

/* ---------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------- */

/*
El backend responde en inglés técnico porque es su contrato. La
interfaz es para RRHH en español, así que traducimos los mensajes
conocidos y, ante uno desconocido, mostramos la explicación del estado
en vez de filtrar texto de sistema a la pantalla.
*/
const backendMessages: Record<string, string> = {
  'Employee code was not found in the file name':
    'El nombre del archivo no contiene un código de empleado reconocible.',
  'Employee code is ambiguous': 'El código del archivo coincide con más de un empleado.',
  'Only PDF files are accepted': 'Solo aceptamos archivos PDF.',
  'The PDF exceeds the maximum allowed size': 'El PDF supera el tamaño máximo permitido.',
  'Invalid PDF file': 'El archivo no es un PDF legible.',
  'The file could not be stored for processing': 'No pudimos guardar el archivo para procesarlo.',
  'A document already exists for this period or employee':
    'Ya existe un documento para este período o empleado.',
  'A payslip already exists for this employee and period':
    'Ya existe un volante para este empleado en este período.',
  'The original file is unavailable':
    'El archivo original ya no está disponible para reintentar. Vuelve a subirlo.',
  'Locked periods cannot receive new payslips':
    'El período está bloqueado y no acepta volantes nuevos.',
  'Completed upload batches cannot be changed': 'Esta tanda ya se cerró y no admite cambios.',
  'Upload batch not found': 'La tanda ya no existe. Actualiza la pantalla.',
  'At least one PDF file is required': 'Selecciona al menos un archivo PDF.',
  'Too many files in one upload request': 'Son demasiados archivos en una sola carga. Divídela.',
  'Too many files in one upload batch': 'Son demasiados archivos en una sola tanda. Divídela.',
  'Too many files in this upload batch': 'Esta tanda ya alcanzó su límite de archivos.',
  'Payroll period not found': 'El período de nómina ya no existe. Actualiza la pantalla.',
}

/*
Los errores de red y de la API llegan con el texto del backend. Se
traducen igual que los mensajes por archivo: el administrador nunca
debería leer una cadena de sistema en inglés.
*/
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return explainMessage(error.message, fallback)
  return fallback
}

export function explainMessage(message: string | null | undefined, fallback: string): string {
  if (!message) return fallback
  return backendMessages[message] ?? fallback
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm
}

export function employeeName(employee: { firstName: string; lastName: string }): string {
  return `${employee.firstName} ${employee.lastName}`.trim()
}
