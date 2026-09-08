import type { Readable } from 'node:stream'

export const FILE_STORAGE = Symbol.for('@payroll/api/file-storage')

export class PayslipStorageFileNotFoundError extends Error {
  readonly code = 'PAYSLIP_FILE_NOT_FOUND'

  constructor() {
    super('Payslip file is not available')
  }
}

export function assertSafeStorageKey(key: string): void {
  const normalized = key.replaceAll('\\', '/')
  if (
    !key ||
    key.includes('\u0000') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('Unsafe storage key')
  }
}

export interface FileStorage {
  put(key: string, content: Uint8Array): Promise<void>
  get(key: string): Promise<Readable>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
