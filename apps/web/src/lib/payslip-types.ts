export interface EmployeeSummary {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  department?: { id: string; code: string; name: string } | null
  position?: { id: string; code: string; name: string } | null
}

export interface EmployeeProfile {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  middleName: string | null
  preferredName: string | null
  email: string | null
  phone: string | null
  documentType: string | null
  documentNumber: string | null
  hireDate: string
  terminationDate: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  departmentId: string | null
  positionId: string | null
  userId: string | null
  department: { id: string; code: string; name: string } | null
  position: { id: string; code: string; name: string } | null
  user: { id: string; name: string; email: string; username: string | null; role: string | null } | null
}


export interface PayrollPeriod {
  id: string
  code: string
  startDate: string
  endDate: string
  paymentDate: string
  status: 'DRAFT' | 'OPEN' | 'LOCKED'
  payrollConfiguration?: { name: string; currency: string; payFrequency: string }
}

export interface Payslip {
  id: string
  employeeId: string | null
  payrollPeriodId: string
  fileName: string
  mimeType: string
  fileSize: number
  checksum: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'NEEDS_REVIEW'
  matchMethod: 'EXACT' | 'NORMALIZED' | 'MANUAL' | 'UNMATCHED'
  reviewReason: string | null
  uploadedAt: string
  publishedAt: string | null
  archivedAt: string | null
  employee: EmployeeSummary | null
  payrollPeriod: Pick<PayrollPeriod, 'id' | 'code' | 'startDate' | 'endDate' | 'paymentDate'>
}

export interface PayslipPeriodSummary {
  participants: number
  expected: number
  payslips: number
  uploaded: number
  published: number
  draft: number
  archived: number
  needsReview: number
  missing: number
}

export interface PayslipListResponse {
  data: Payslip[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  summary?: PayslipPeriodSummary
}

export interface MissingEmployeesResponse {
  data: EmployeeSummary[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type PayslipUploadBatchStatus =
  | 'PROCESSING'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'

export type PayslipUploadItemStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'NEEDS_REVIEW'
  | 'DUPLICATE'
  | 'INVALID'
  | 'FAILED'
  | 'SKIPPED'

export interface PayslipUploadBatchItem {
  id: string
  originalFileName: string
  status: PayslipUploadItemStatus
  payslipId: string | null
  employee: EmployeeSummary | null
  matchMethod: 'EXACT' | 'NORMALIZED' | 'MANUAL' | 'UNMATCHED'
  code?: string
  message?: string
  duplicateOfPayslipId?: string
  attemptCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface PayslipUploadBatchSummary {
  totalFiles: number
  processedFiles: number
  matchedFiles: number
  publishedFiles: number
  needsReviewFiles: number
  duplicateFiles: number
  invalidFiles: number
  failedFiles: number
  readyFiles: number
}

export interface PayslipUploadBatch {
  id: string
  payrollPeriodId: string
  createdByUserId: string | null
  status: PayslipUploadBatchStatus
  createdAt: string
  completedAt: string | null
  payrollPeriod: Pick<PayrollPeriod, 'id' | 'code' | 'startDate' | 'endDate' | 'paymentDate'>
  summary: PayslipUploadBatchSummary
  items?: PayslipUploadBatchItem[]
}

export interface PayslipUploadBatchListResponse {
  data: PayslipUploadBatch[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface Department {
  id: string
  code: string
  name: string
  description?: string | null
  isActive: boolean
}

export interface Position {
  id: string
  code: string
  name: string
  description?: string | null
  isActive: boolean
}

export interface DepartmentListResponse {
  data: Department[]
}

export interface PositionListResponse {
  data: Position[]
}

export interface EmployeeFull {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  middleName: string | null
  preferredName: string | null
  email: string | null
  phone: string | null
  documentType: string | null
  documentNumber: string | null
  hireDate: string
  terminationDate: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  departmentId: string | null
  positionId: string | null
  userId: string | null
  department: { id: string; code: string; name: string } | null
  position: { id: string; code: string; name: string } | null
  user: { id: string; name: string; email: string; username: string | null; role: string | null } | null
  createdAt: string
  updatedAt: string
}

export interface EmployeeListResponse {
  data: EmployeeFull[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}
