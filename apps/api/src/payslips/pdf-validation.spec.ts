import { createHash } from 'node:crypto'
import {
  DEFAULT_MAX_PAYSLIP_SIZE_BYTES,
  extractEmployeeCodeCandidates,
  sanitizeOriginalFileName,
  sha256,
  validatePdfUpload,
} from './pdf-validation.js'

describe('payslip PDF validation', () => {
  const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')

  it('accepts a PDF with the expected extension, MIME and signatures', () => {
    expect(
      validatePdfUpload({
        originalname: 'EMP-00001_2026-09-15.pdf',
        mimetype: 'application/pdf',
        size: validPdf.length,
        buffer: validPdf,
      }),
    ).toEqual({ valid: true })
  })

  it('rejects a fake PDF whose extension is only cosmetic', () => {
    const result = validatePdfUpload({
      originalname: 'EMP-00001.pdf',
      mimetype: 'application/pdf',
      size: 12,
      buffer: Buffer.from('this is not a pdf'),
    })

    expect(result).toEqual({ valid: false, code: 'INVALID_PDF', message: 'Invalid PDF file' })
  })

  it('rejects a corrupt PDF without an EOF marker', () => {
    const result = validatePdfUpload({
      originalname: 'broken.pdf',
      mimetype: 'application/pdf',
      size: 20,
      buffer: Buffer.from('%PDF-1.7\ntruncated document'),
    })

    expect(result).toEqual({ valid: false, code: 'INVALID_PDF', message: 'Invalid PDF file' })
  })

  it('rejects invalid MIME, extension and oversized uploads', () => {
    expect(
      validatePdfUpload({
        originalname: 'document.exe',
        mimetype: 'application/octet-stream',
        size: validPdf.length,
        buffer: validPdf,
      }),
    ).toMatchObject({ valid: false, code: 'INVALID_PDF_TYPE' })
    expect(
      validatePdfUpload({
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: DEFAULT_MAX_PAYSLIP_SIZE_BYTES + 1,
        buffer: validPdf,
      }),
    ).toMatchObject({ valid: false, code: 'PAYSLIP_FILE_TOO_LARGE' })
  })

  it.each([
    ['fake.pdf.exe', 'application/pdf', validPdf],
    ['document.pdf', 'text/html', validPdf],
    ['document.pdf', 'application/pdf', Buffer.from('')],
    ['document.pdf', 'application/pdf', Buffer.from('<html>not a pdf</html>')],
    ['document.pdf', 'application/pdf', Buffer.from('%PDF-1.7\ntruncated')],
  ])('rejects adversarial upload %s', (originalname, mimetype, buffer) => {
    expect(
      validatePdfUpload({
        originalname,
        mimetype,
        size: buffer.length,
        buffer,
      }),
    ).toMatchObject({ valid: false })
  })

  it('rejects an upload whose declared size is below the limit but actual bytes exceed it', () => {
    const oversizedPdf = Buffer.alloc(DEFAULT_MAX_PAYSLIP_SIZE_BYTES + 1, 0x20)
    oversizedPdf.write('%PDF-', 0, 'ascii')
    oversizedPdf.write('%%EOF', oversizedPdf.length - 5, 'ascii')

    expect(
      validatePdfUpload({
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 1,
        buffer: oversizedPdf,
      }),
    ).toMatchObject({ valid: false, code: 'PAYSLIP_FILE_TOO_LARGE' })
  })

  it('extracts exact employee-code candidates without fuzzy matching', () => {
    expect(extractEmployeeCodeCandidates('Volante_EMP-00001_2026-09-15.pdf')).toContain('EMP-00001')
    expect(extractEmployeeCodeCandidates('EMP-00001.pdf')).toContain('EMP-00001')
    expect(extractEmployeeCodeCandidates('random-document.pdf')).not.toContain('EMP')
  })

  it('sanitizes names for display and computes SHA-256', () => {
    expect(sanitizeOriginalFileName('../../secret\r\n.pdf')).toBe('secret.pdf')
    expect(sanitizeOriginalFileName('..\\..\\secret.pdf')).toBe('secret.pdf')
    expect(sanitizeOriginalFileName('')).toBe('document.pdf')
    expect(sha256(validPdf)).toBe(createHash('sha256').update(validPdf).digest('hex'))
  })
})
