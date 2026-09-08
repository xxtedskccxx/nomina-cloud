import { createHash } from 'node:crypto'

export const DEFAULT_MAX_PAYSLIP_SIZE_BYTES = 20_000_000

export interface PdfUploadCandidate {
  originalname: string
  mimetype: string
  size: number
  buffer: Uint8Array
}

export type PdfValidationResult =
  | { valid: true }
  | {
      valid: false
      code: 'INVALID_PDF_TYPE' | 'PAYSLIP_FILE_TOO_LARGE' | 'INVALID_PDF'
      message: string
    }

export function validatePdfUpload(
  file: PdfUploadCandidate,
  maxSizeBytes = DEFAULT_MAX_PAYSLIP_SIZE_BYTES,
): PdfValidationResult {
  const extension = file.originalname.toLowerCase().endsWith('.pdf')
  const mimeType = file.mimetype.toLowerCase() === 'application/pdf'
  if (!extension || !mimeType) {
    return { valid: false, code: 'INVALID_PDF_TYPE', message: 'Only PDF files are accepted' }
  }

  const actualSize = file.buffer.byteLength
  if (file.size > maxSizeBytes || actualSize > maxSizeBytes) {
    return {
      valid: false,
      code: 'PAYSLIP_FILE_TOO_LARGE',
      message: 'The PDF exceeds the maximum allowed size',
    }
  }

  const header = Buffer.from(file.buffer.subarray(0, 5)).toString('ascii')
  const tail = Buffer.from(file.buffer.subarray(Math.max(0, actualSize - 1_024))).toString('ascii')
  if (header !== '%PDF-' || !tail.includes('%%EOF')) {
    return { valid: false, code: 'INVALID_PDF', message: 'Invalid PDF file' }
  }

  return { valid: true }
}

export function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function sanitizeOriginalFileName(originalName: string): string {
  const basename = originalName.replaceAll('\\', '/').split('/').pop() ?? 'document.pdf'
  const sanitized = basename
    .split('')
    .filter((character) => {
      const codePoint = character.charCodeAt(0)
      return codePoint > 31 && codePoint !== 127
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255)
  return sanitized || 'document.pdf'
}

export function extractEmployeeCodeCandidates(originalName: string): string[] {
  const baseName = sanitizeOriginalFileName(originalName)
    .replace(/\.pdf$/i, '')
    .toUpperCase()
  const candidates = new Set<string>()
  const matches = baseName.match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/g) ?? []

  for (const match of matches) {
    candidates.add(match)
  }

  return [...candidates]
}
