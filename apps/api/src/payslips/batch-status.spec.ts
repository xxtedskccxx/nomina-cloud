import { describe, expect, it } from '@jest/globals'
import { deriveUploadBatchStatus } from './batch-status.js'

describe('deriveUploadBatchStatus', () => {
  it('keeps a batch processing while an item is active', () => {
    expect(deriveUploadBatchStatus(['PROCESSING', 'COMPLETED'])).toBe('PROCESSING')
  })

  it('marks an all-successful batch ready for publication', () => {
    expect(deriveUploadBatchStatus(['COMPLETED', 'COMPLETED'])).toBe('READY')
  })

  it('marks mixed results as partial without blocking the successful items', () => {
    expect(deriveUploadBatchStatus(['COMPLETED', 'FAILED', 'DUPLICATE'])).toBe('PARTIAL')
  })

  it('keeps an exception-only batch in needs review', () => {
    expect(deriveUploadBatchStatus(['NEEDS_REVIEW', 'INVALID'])).toBe('NEEDS_REVIEW')
  })

  it('marks a batch failed when every item failed', () => {
    expect(deriveUploadBatchStatus(['FAILED', 'FAILED'])).toBe('FAILED')
  })
})
