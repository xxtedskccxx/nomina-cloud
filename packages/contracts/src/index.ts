export const UserRole = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const

export type Role = (typeof UserRole)[keyof typeof UserRole]

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: Role
}

export const EmploymentStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  TERMINATED: 'TERMINATED',
} as const

export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus]

export const DocumentType = {
  CEDULA: 'CEDULA',
  PASSPORT: 'PASSPORT',
  OTHER: 'OTHER',
} as const

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType]

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface DepartmentContract {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PositionContract {
  id: string
  code: string
  name: string
  description: string | null
  departmentId: string | null
  department: Pick<DepartmentContract, 'id' | 'code' | 'name'> | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface EmployeeContract {
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
  status: EmploymentStatus
  departmentId: string | null
  positionId: string | null
  userId: string | null
  department: Pick<DepartmentContract, 'id' | 'code' | 'name'> | null
  position: Pick<PositionContract, 'id' | 'code' | 'name'> | null
  user:
    | (Pick<CurrentUser, 'id' | 'name' | 'email' | 'role'> & {
        username: string | null
      })
    | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationMeta
}

export const EmploymentType = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACTOR: 'CONTRACTOR',
  TEMPORARY: 'TEMPORARY',
  INTERN: 'INTERN',
} as const

export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType]

export const EmploymentRecordStatus = {
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
} as const

export type EmploymentRecordStatus =
  (typeof EmploymentRecordStatus)[keyof typeof EmploymentRecordStatus]

export const PayFrequency = {
  MONTHLY: 'MONTHLY',
  BIWEEKLY: 'BIWEEKLY',
  WEEKLY: 'WEEKLY',
  HOURLY: 'HOURLY',
} as const

export type PayFrequency = (typeof PayFrequency)[keyof typeof PayFrequency]

export const Currency = {
  DOP: 'DOP',
  USD: 'USD',
  EUR: 'EUR',
} as const

export type CurrencyCode = string

export interface EmploymentContract {
  id: string
  employeeId: string
  employmentType: EmploymentType
  startDate: string
  endDate: string | null
  status: EmploymentRecordStatus
  employee: Pick<EmployeeContract, 'id' | 'employeeCode' | 'firstName' | 'lastName'> & {
    department: Pick<DepartmentContract, 'id' | 'code' | 'name'> | null
    position: Pick<PositionContract, 'id' | 'code' | 'name'> | null
  }
  createdAt: string
  updatedAt: string
}

export interface CompensationContract {
  id: string
  employmentId: string
  amount: string
  currency: CurrencyCode
  payFrequency: PayFrequency
  effectiveFrom: string
  effectiveTo: string | null
  createdAt: string
  updatedAt: string
  employment?: EmploymentContract
}

export const PayrollPeriodStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  LOCKED: 'LOCKED',
} as const

export type PayrollPeriodStatus = (typeof PayrollPeriodStatus)[keyof typeof PayrollPeriodStatus]

export const PayrollCompensationCoverage = {
  NONE: 'NONE',
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE',
} as const

export type PayrollCompensationCoverage =
  (typeof PayrollCompensationCoverage)[keyof typeof PayrollCompensationCoverage]

export interface PayrollConfigurationContract {
  id: string
  code: string
  name: string
  currency: CurrencyCode
  payFrequency: PayFrequency
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PayrollPeriodContract {
  id: string
  payrollConfigurationId: string
  code: string
  startDate: string
  endDate: string
  paymentDate: string
  status: PayrollPeriodStatus
  openedAt: string | null
  openedByUserId: string | null
  lockedAt: string | null
  lockedByUserId: string | null
  reopenedAt: string | null
  reopenedByUserId: string | null
  createdAt: string
  updatedAt: string
  payrollConfiguration?: Pick<
    PayrollConfigurationContract,
    'id' | 'code' | 'name' | 'currency' | 'payFrequency'
  >
}

export interface PayrollParticipantContract {
  id: string
  payrollPeriodId: string
  employeeId: string
  employmentId: string
  compensationId: string | null
  compensationCoverage: PayrollCompensationCoverage
  createdAt: string
  employee?: Pick<EmployeeContract, 'id' | 'employeeCode' | 'firstName' | 'lastName'>
  employment?: Pick<
    EmploymentContract,
    'id' | 'employeeId' | 'employmentType' | 'startDate' | 'endDate' | 'status'
  >
  compensation?: Pick<
    CompensationContract,
    'id' | 'amount' | 'currency' | 'payFrequency' | 'effectiveFrom' | 'effectiveTo'
  > | null
}

export const PayslipStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const

export type PayslipStatus = (typeof PayslipStatus)[keyof typeof PayslipStatus]

export const PayslipMatchStatus = {
  UNMATCHED: 'UNMATCHED',
  MATCHED: 'MATCHED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const

export type PayslipMatchStatus = (typeof PayslipMatchStatus)[keyof typeof PayslipMatchStatus]

export const PayslipMatchMethod = {
  EXACT: 'EXACT',
  NORMALIZED: 'NORMALIZED',
  MANUAL: 'MANUAL',
  UNMATCHED: 'UNMATCHED',
} as const

export type PayslipMatchMethod = (typeof PayslipMatchMethod)[keyof typeof PayslipMatchMethod]

export interface PayslipEmployeeSummary {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  department?: Pick<DepartmentContract, 'id' | 'code' | 'name'> | null
  position?: Pick<PositionContract, 'id' | 'code' | 'name'> | null
}

export interface PayslipContract {
  id: string
  employeeId: string | null
  payrollPeriodId: string
  originalFileName: string
  mimeType: string
  fileSize: number
  checksum: string
  status: PayslipStatus
  matchStatus: PayslipMatchStatus
  matchMethod: PayslipMatchMethod
  reviewReason: string | null
  uploadedAt: string
  publishedAt: string | null
  archivedAt?: string | null
  employee: PayslipEmployeeSummary | null
  payrollPeriod: Pick<
    PayrollPeriodContract,
    'id' | 'code' | 'startDate' | 'endDate' | 'paymentDate'
  >
}

export interface PayslipUploadItemContract {
  id?: string
  originalFileName: string
  status:
    | 'UPLOADED'
    | 'NEEDS_REVIEW'
    | 'DUPLICATE'
    | 'INVALID'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED'
  payslipId: string | null
  employee: PayslipEmployeeSummary | null
  matchMethod?: PayslipMatchMethod
  code?: string
  message?: string
  duplicateOfPayslipId?: string
  attemptCount?: number
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}

export interface PayslipUploadBatchContract {
  id?: string
  payrollPeriodId?: string
  status?: PayslipUploadBatchStatus
  createdByUserId?: string | null
  createdAt?: string
  completedAt?: string | null
  summary?: PayslipUploadBatchSummary
  total: number
  uploaded: number
  matched: number
  needsReview: number
  duplicates: number
  invalid: number
  items: PayslipUploadItemContract[]
}

export const PayslipUploadBatchStatus = {
  PROCESSING: 'PROCESSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const

export type PayslipUploadBatchStatus =
  (typeof PayslipUploadBatchStatus)[keyof typeof PayslipUploadBatchStatus]

export const PayslipUploadItemStatus = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  DUPLICATE: 'DUPLICATE',
  INVALID: 'INVALID',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const

export type PayslipUploadItemStatus =
  (typeof PayslipUploadItemStatus)[keyof typeof PayslipUploadItemStatus]

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

export interface PayslipUploadBatchPeriodSummary {
  id: string
  code: string
  startDate: string
  endDate: string
  paymentDate: string
}

export interface PayslipUploadBatchRecordContract {
  id: string
  payrollPeriodId: string
  createdByUserId: string | null
  status: PayslipUploadBatchStatus
  createdAt: string
  completedAt: string | null
  payrollPeriod: PayslipUploadBatchPeriodSummary
  summary: PayslipUploadBatchSummary
  items?: PayslipUploadItemContract[]
}
