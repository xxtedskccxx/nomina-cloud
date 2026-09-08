export type UploadBatchStatus =
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'

type UploadItemStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'NEEDS_REVIEW'
  | 'DUPLICATE'
  | 'INVALID'
  | 'FAILED'
  | 'SKIPPED'

const attentionStatuses = new Set<UploadItemStatus>([
  'NEEDS_REVIEW',
  'DUPLICATE',
  'INVALID',
  'FAILED',
])

export function deriveUploadBatchStatus(items: readonly UploadItemStatus[]): UploadBatchStatus {
  if (items.length === 0 || items.includes('PROCESSING')) return 'PROCESSING'

  const hasCompleted = items.includes('COMPLETED')
  const hasAttention = items.some((status) => attentionStatuses.has(status))
  if (hasCompleted && !hasAttention) return 'READY'
  if (hasCompleted && hasAttention) return 'PARTIAL'
  if (items.every((status) => status === 'FAILED')) return 'FAILED'
  return 'NEEDS_REVIEW'
}
