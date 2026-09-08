import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient, Prisma } from '@payroll/database'
import type { Environment } from '@payroll/config'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import { FILE_STORAGE } from './file-storage.js'
import type { FileStorage } from './file-storage.js'
import type { UploadedPayslipFile } from './payslips.service.js'
import { PayslipPublicationService } from './payslip-publication.service.js'
import { deriveUploadBatchStatus } from './batch-status.js'
import { matchEmployeeFromFileName } from './matching.js'
import { sha256, sanitizeOriginalFileName, validatePdfUpload } from './pdf-validation.js'
import {
  employeeSummarySelect,
  periodSummarySelect,
  type EmployeeSummary,
} from './payslip-shared.js'
import { PayslipUploadBatchListQueryDto } from './dto/payslip-upload-batch-list-query.dto.js'

const activePayslipStatuses = [PayslipStatus.DRAFT, PayslipStatus.PUBLISHED] as const

const batchItemSelect = {
  id: true,
  batchId: true,
  originalFileName: true,
  checksum: true,
  stagingStorageKey: true,
  payslipId: true,
  duplicateOfPayslipId: true,
  status: true,
  matchMethod: true,
  errorCode: true,
  message: true,
  attemptCount: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  payslip: {
    select: {
      employeeId: true,
      status: true,
      matchStatus: true,
      employee: { select: employeeSummarySelect },
    },
  },
} as const

const batchSelect = {
  id: true,
  payrollPeriodId: true,
  createdByUserId: true,
  status: true,
  createdAt: true,
  completedAt: true,
  payrollPeriod: { select: periodSummarySelect },
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: batchItemSelect,
  },
} as const

type BatchRecord = Prisma.PayslipUploadBatchGetPayload<{ select: typeof batchSelect }>
type BatchItemRecord = BatchRecord['items'][number]

function serializeBatchItem(item: BatchItemRecord) {
  return {
    id: item.id,
    originalFileName: item.originalFileName,
    status: item.status,
    payslipId: item.payslipId,
    employee: item.payslip?.employee ?? null,
    matchMethod: item.matchMethod,
    code: item.errorCode ?? undefined,
    message: item.message ?? undefined,
    duplicateOfPayslipId: item.duplicateOfPayslipId ?? undefined,
    attemptCount: item.attemptCount,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: item.completedAt?.toISOString() ?? null,
  }
}

function summaryForItems(items: readonly BatchItemRecord[]) {
  return {
    totalFiles: items.length,
    processedFiles: items.filter((item) => item.status !== 'PROCESSING').length,
    matchedFiles: items.filter(
      (item) => item.payslip?.employeeId != null && item.payslip.matchStatus === 'MATCHED',
    ).length,
    publishedFiles: items.filter((item) => item.payslip?.status === 'PUBLISHED').length,
    needsReviewFiles: items.filter((item) => item.status === 'NEEDS_REVIEW').length,
    duplicateFiles: items.filter((item) => item.status === 'DUPLICATE').length,
    invalidFiles: items.filter((item) => item.status === 'INVALID').length,
    failedFiles: items.filter((item) => item.status === 'FAILED').length,
    readyFiles: items.filter(
      (item) =>
        item.status === 'COMPLETED' &&
        item.payslip?.status === 'DRAFT' &&
        item.payslip.matchStatus === 'MATCHED',
    ).length,
  }
}

function serializeBatch(batch: BatchRecord) {
  return {
    id: batch.id,
    payrollPeriodId: batch.payrollPeriodId,
    createdByUserId: batch.createdByUserId,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    payrollPeriod: {
      ...batch.payrollPeriod,
      startDate: batch.payrollPeriod.startDate.toISOString().slice(0, 10),
      endDate: batch.payrollPeriod.endDate.toISOString().slice(0, 10),
      paymentDate: batch.payrollPeriod.paymentDate.toISOString().slice(0, 10),
    },
    summary: summaryForItems(batch.items),
    items: batch.items.map(serializeBatchItem),
  }
}

function toLegacyStatus(status: BatchItemRecord['status']) {
  if (status === 'COMPLETED') return 'UPLOADED' as const
  if (status === 'NEEDS_REVIEW') return 'NEEDS_REVIEW' as const
  if (status === 'DUPLICATE') return 'DUPLICATE' as const
  if (status === 'INVALID') return 'INVALID' as const
  return 'FAILED' as const
}

function errorMessage(): string {
  return 'Upload processing failed. Retry this item.'
}

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

@Injectable()
export class PayslipUploadBatchesService {
  private readonly maxFileSizeBytes: number
  private readonly maxFilesPerUpload: number
  private readonly maxFilesPerBatch: number

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly publication: PayslipPublicationService,
    configService: ConfigService<Environment>,
    private readonly logger: PinoLogger,
  ) {
    this.maxFileSizeBytes = configService.get('PAYSLIP_MAX_FILE_SIZE_BYTES') ?? 20_000_000
    this.maxFilesPerUpload = configService.get('PAYSLIP_MAX_FILES_PER_UPLOAD') ?? 100
    this.maxFilesPerBatch = configService.get('PAYSLIP_MAX_FILES_PER_BATCH') ?? 500
  }

  async create(periodId: string, actorUserId: string) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, status: true },
    })
    if (!period) throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
    if (period.status === 'LOCKED') {
      throw conflict('PAYSLIP_PERIOD_LOCKED', 'Locked periods cannot receive new payslips')
    }
    const batch = await this.database.payslipUploadBatch.create({
      data: { payrollPeriodId: periodId, createdByUserId: actorUserId },
      select: { id: true },
    })
    this.logger.info(
      { actorUserId, batchId: batch.id, payrollPeriodId: periodId },
      'Payslip upload batch created',
    )
    return this.findOne(batch.id)
  }

  async findAll(query: PayslipUploadBatchListQueryDto = new PayslipUploadBatchListQueryDto()) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = {
      ...(query.periodId ? { payrollPeriodId: query.periodId } : {}),
      ...(query.status ? { status: query.status } : {}),
    }
    const [total, batches] = await Promise.all([
      this.database.payslipUploadBatch.count({ where }),
      this.database.payslipUploadBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          payrollPeriodId: true,
          createdByUserId: true,
          status: true,
          createdAt: true,
          completedAt: true,
          payrollPeriod: { select: periodSummarySelect },
        },
      }),
    ])
    const batchIds = batches.map((batch) => batch.id)
    const items = batchIds.length
      ? await this.database.payslipUploadItem.findMany({
          where: { batchId: { in: batchIds } },
          select: batchItemSelect,
          orderBy: { createdAt: 'asc' },
        })
      : []
    const itemsByBatchId = new Map<string, BatchItemRecord[]>()
    for (const item of items) {
      const current = itemsByBatchId.get(item.batchId) ?? []
      itemsByBatchId.set(item.batchId, [...current, item])
    }
    return {
      data: batches.map((batch) => ({
        id: batch.id,
        payrollPeriodId: batch.payrollPeriodId,
        createdByUserId: batch.createdByUserId,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
        completedAt: batch.completedAt?.toISOString() ?? null,
        payrollPeriod: {
          ...batch.payrollPeriod,
          startDate: batch.payrollPeriod.startDate.toISOString().slice(0, 10),
          endDate: batch.payrollPeriod.endDate.toISOString().slice(0, 10),
          paymentDate: batch.payrollPeriod.paymentDate.toISOString().slice(0, 10),
        },
        summary: summaryForItems(itemsByBatchId.get(batch.id) ?? []),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(batchId: string) {
    const batch = await this.database.payslipUploadBatch.findUnique({
      where: { id: batchId },
      select: batchSelect,
    })
    if (!batch) throw notFound('PAYSLIP_UPLOAD_BATCH_NOT_FOUND', 'Upload batch not found')
    return { data: serializeBatch(batch) }
  }

  async addFiles(batchId: string, files: UploadedPayslipFile[], actorUserId: string) {
    if (!files || files.length === 0) {
      throw badRequest('PAYSLIP_FILES_REQUIRED', 'At least one PDF file is required')
    }
    if (files.length > this.maxFilesPerUpload) {
      throw badRequest('PAYSLIP_BATCH_TOO_LARGE', 'Too many files in one upload request')
    }
    const batch = await this.getBatchForMutation(batchId)
    const itemCount = await this.database.payslipUploadItem.count({ where: { batchId } })
    if (itemCount + files.length > this.maxFilesPerBatch) {
      throw badRequest('PAYSLIP_BATCH_TOO_LARGE', 'Too many files in this upload batch')
    }
    const employees = await this.database.employee.findMany({ select: employeeSummarySelect })
    for (const file of files) {
      await this.processFile(batch, file, actorUserId, employees)
    }
    await this.refreshBatchStatus(batchId)
    const detail = await this.findOne(batchId)
    this.logger.info(
      {
        actorUserId,
        batchId,
        fileCount: files.length,
        status: detail.data.status,
        processedFiles: detail.data.summary.processedFiles,
      },
      'Payslip upload batch files processed',
    )
    return {
      data: {
        batchId,
        items: detail.data.items?.slice(-files.length) ?? [],
        summary: detail.data.summary,
        status: detail.data.status,
      },
    }
  }

  async retry(batchId: string, actorUserId: string, itemIds?: string[]) {
    const batch = await this.getBatchForMutation(batchId)
    this.logger.info(
      { actorUserId, batchId, requestedItems: itemIds?.length ?? 'all' },
      'Payslip upload retry started',
    )
    const where = {
      batchId,
      status: 'FAILED' as const,
      ...(itemIds && itemIds.length > 0 ? { id: { in: itemIds } } : {}),
    }
    const failedItems = await this.database.payslipUploadItem.findMany({
      where,
      select: batchItemSelect,
      orderBy: { createdAt: 'asc' },
    })
    const employees = await this.database.employee.findMany({ select: employeeSummarySelect })
    for (const item of failedItems) {
      if (!item.stagingStorageKey) {
        await this.markFailed(
          item.id,
          'PAYSLIP_RETRY_FILE_NOT_AVAILABLE',
          'The original file is unavailable',
        )
        continue
      }
      try {
        const fileBuffer = await readableToBuffer(await this.storage.get(item.stagingStorageKey))
        await this.processFile(
          batch,
          {
            originalname: item.originalFileName,
            mimetype: 'application/pdf',
            size: fileBuffer.byteLength,
            buffer: fileBuffer,
          },
          actorUserId,
          employees,
          item.id,
        )
      } catch {
        await this.markFailed(item.id, 'PAYSLIP_RETRY_FAILED', errorMessage())
      }
    }
    await this.refreshBatchStatus(batchId)
    return this.findOne(batchId)
  }

  async refreshForPayslip(payslipId: string) {
    const item = await this.database.payslipUploadItem.findUnique({
      where: { payslipId },
      select: { batchId: true },
    })
    if (item) await this.refreshBatchStatus(item.batchId)
  }

  async publish(batchId: string, actorUserId: string) {
    const batch = await this.database.payslipUploadBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        status: true,
        items: { select: { payslipId: true, status: true } },
      },
    })
    if (!batch) throw notFound('PAYSLIP_UPLOAD_BATCH_NOT_FOUND', 'Upload batch not found')
    const payslipIds = batch.items
      .filter((item) => item.status === 'COMPLETED' && item.payslipId)
      .map((item) => item.payslipId!)
    const unresolvedCount = batch.items.filter(
      (item) => item.status !== 'COMPLETED' || !item.payslipId,
    ).length
    const result = await this.publication.publishIds(payslipIds, actorUserId)
    this.logger.info(
      { actorUserId, batchId, published: result.published, skipped: result.skipped },
      'Payslip upload batch published',
    )
    const refreshed = batch.status !== 'COMPLETED' ? await this.refreshBatchStatus(batchId) : null
    if (
      batch.status !== 'COMPLETED' &&
      refreshed?.status === 'READY' &&
      result.skipped === 0 &&
      payslipIds.length > 0
    ) {
      await this.database.payslipUploadBatch.update({
        where: { id: batchId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    }
    return {
      data: {
        ...result,
        skipped: result.skipped + unresolvedCount,
        unresolved: unresolvedCount,
        batchId,
      },
    }
  }

  async uploadLegacy(periodId: string, files: UploadedPayslipFile[], actorUserId: string) {
    if (!files || files.length === 0) {
      throw badRequest('PAYSLIP_FILES_REQUIRED', 'At least one PDF file is required')
    }
    if (files.length > this.maxFilesPerBatch) {
      throw badRequest('PAYSLIP_BATCH_TOO_LARGE', 'Too many files in one upload batch')
    }
    const batch = await this.create(periodId, actorUserId)
    const result = await this.addFiles(batch.data.id, files, actorUserId)
    const items = result.data.items ?? []
    const legacyItems = items.map((item) => ({
      originalFileName: item.originalFileName,
      status: toLegacyStatus(item.status),
      payslipId: item.payslipId,
      employee: item.employee,
      ...(item.code ? { code: item.code } : {}),
      ...(item.message ? { message: item.message } : {}),
      ...(item.duplicateOfPayslipId ? { duplicateOfPayslipId: item.duplicateOfPayslipId } : {}),
      matchMethod: item.matchMethod,
    }))
    return {
      data: {
        batchId: batch.data.id,
        total: legacyItems.length,
        uploaded: legacyItems.filter((item) => ['UPLOADED', 'NEEDS_REVIEW'].includes(item.status))
          .length,
        matched: legacyItems.filter((item) => item.status === 'UPLOADED' && item.employee !== null)
          .length,
        needsReview: legacyItems.filter((item) => item.status === 'NEEDS_REVIEW').length,
        duplicates: legacyItems.filter((item) => item.status === 'DUPLICATE').length,
        invalid: legacyItems.filter((item) => item.status === 'INVALID').length,
        failed: legacyItems.filter((item) => item.status === 'FAILED').length,
        items: legacyItems,
      },
    }
  }

  private async getBatchForMutation(batchId: string) {
    const batch = await this.database.payslipUploadBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        payrollPeriodId: true,
        status: true,
        payrollPeriod: { select: { id: true, status: true } },
      },
    })
    if (!batch) throw notFound('PAYSLIP_UPLOAD_BATCH_NOT_FOUND', 'Upload batch not found')
    if (batch.payrollPeriod.status === 'LOCKED') {
      throw conflict('PAYSLIP_PERIOD_LOCKED', 'Locked periods cannot receive new payslips')
    }
    if (batch.status === 'COMPLETED') {
      throw conflict('PAYSLIP_UPLOAD_BATCH_COMPLETED', 'Completed upload batches cannot be changed')
    }
    return batch
  }

  private async processFile(
    batch: { id: string; payrollPeriodId: string },
    file: UploadedPayslipFile,
    actorUserId: string,
    employees: readonly EmployeeSummary[],
    existingItemId?: string,
  ) {
    const fileName = sanitizeOriginalFileName(file.originalname)
    const checksum = sha256(file.buffer)
    if (!existingItemId) {
      const existingBatchItem = await this.database.payslipUploadItem.findFirst({
        where: { batchId: batch.id, checksum },
        select: batchItemSelect,
      })
      if (existingBatchItem) return existingBatchItem
    }

    const validation = validatePdfUpload(file, this.maxFileSizeBytes)
    if (!validation.valid) {
      if (existingItemId) {
        return this.database.payslipUploadItem.update({
          where: { id: existingItemId },
          data: {
            status: 'INVALID',
            checksum,
            errorCode: validation.code,
            message: validation.message,
            attemptCount: { increment: 1 },
            completedAt: new Date(),
            stagingStorageKey: null,
          },
          select: batchItemSelect,
        })
      }
      return this.database.payslipUploadItem.create({
        data: {
          batchId: batch.id,
          originalFileName: fileName,
          checksum,
          status: 'INVALID',
          errorCode: validation.code,
          message: validation.message,
          completedAt: new Date(),
        },
        select: batchItemSelect,
      })
    }

    const match = matchEmployeeFromFileName(file.originalname, employees)
    const employee = match.employee
    const duplicateByChecksum = await this.database.payslip.findFirst({
      where: { payrollPeriodId: batch.payrollPeriodId, checksum },
      select: { id: true },
    })
    if (duplicateByChecksum) {
      return this.saveDuplicateItem(
        batch.id,
        fileName,
        checksum,
        match.method,
        duplicateByChecksum.id,
        existingItemId,
      )
    }
    if (employee) {
      const duplicateForEmployee = await this.database.payslip.findFirst({
        where: {
          payrollPeriodId: batch.payrollPeriodId,
          employeeId: employee.id,
          status: { in: [...activePayslipStatuses] },
        },
        select: { id: true },
      })
      if (duplicateForEmployee) {
        return this.saveDuplicateItem(
          batch.id,
          fileName,
          checksum,
          match.method,
          duplicateForEmployee.id,
          existingItemId,
          employee.id,
        )
      }
    }

    let stagingStorageKey: string
    if (existingItemId) {
      const existingItem = await this.database.payslipUploadItem.findUnique({
        where: { id: existingItemId },
        select: { stagingStorageKey: true, batchId: true },
      })
      if (!existingItem || existingItem.batchId !== batch.id || !existingItem.stagingStorageKey) {
        return this.markFailed(
          existingItemId,
          'PAYSLIP_RETRY_FILE_NOT_AVAILABLE',
          'The original file is unavailable',
        )
      }
      stagingStorageKey = existingItem.stagingStorageKey
      await this.database.payslipUploadItem.update({
        where: { id: existingItemId },
        data: {
          status: 'PROCESSING',
          checksum,
          errorCode: null,
          message: null,
          attemptCount: { increment: 1 },
          completedAt: null,
          matchMethod: match.method,
        },
      })
    } else {
      stagingStorageKey = `upload-batches/${batch.id}/${randomUUID()}.pdf`
      try {
        await this.storage.put(stagingStorageKey, file.buffer)
      } catch {
        return this.database.payslipUploadItem.create({
          data: {
            batchId: batch.id,
            originalFileName: fileName,
            checksum,
            status: 'FAILED',
            matchMethod: match.method,
            errorCode: 'PAYSLIP_STORAGE_WRITE_FAILED',
            message: 'The file could not be stored for processing',
            completedAt: new Date(),
          },
          select: batchItemSelect,
        })
      }
      try {
        await this.database.payslipUploadItem.create({
          data: {
            batchId: batch.id,
            originalFileName: fileName,
            checksum,
            stagingStorageKey,
            status: 'PROCESSING',
            matchMethod: match.method,
          },
        })
      } catch (error) {
        await this.storage.delete(stagingStorageKey)
        if (hasDatabaseErrorCode(error, 'P2002')) {
          const existing = await this.database.payslipUploadItem.findFirst({
            where: { batchId: batch.id, checksum },
            select: batchItemSelect,
          })
          if (existing) return existing
        }
        throw error
      }
    }

    const participant = employee
      ? await this.database.payrollParticipant.findFirst({
          where: { payrollPeriodId: batch.payrollPeriodId, employeeId: employee.id },
          select: { id: true },
        })
      : null
    const matchStatus = employee
      ? participant
        ? PayslipMatchStatus.MATCHED
        : PayslipMatchStatus.NEEDS_REVIEW
      : PayslipMatchStatus.UNMATCHED
    const reviewReason = employee
      ? participant
        ? null
        : 'Employee is not included in the selected payroll period'
      : match.reviewReason

    const storageKey = `${batch.payrollPeriodId}/${randomUUID()}.pdf`
    let createdPayslipId: string | undefined
    try {
      await this.storage.put(storageKey, file.buffer)
      const payslip = await this.database.payslip.create({
        data: {
          employeeId: employee?.id ?? null,
          payrollPeriodId: batch.payrollPeriodId,
          originalFileName: fileName,
          storageKey,
          mimeType: 'application/pdf',
          fileSize: file.buffer.byteLength,
          checksum,
          status: PayslipStatus.DRAFT,
          matchStatus,
          matchMethod: match.method,
          reviewReason,
          uploadedByUserId: actorUserId,
        },
        select: { id: true },
      })
      createdPayslipId = payslip.id
      await this.database.payslipUploadItem.update({
        where: { id: existingItemId ?? (await this.findItemId(batch.id, checksum)) },
        data: {
          payslipId: payslip.id,
          status: matchStatus === PayslipMatchStatus.MATCHED ? 'COMPLETED' : 'NEEDS_REVIEW',
          matchMethod: match.method,
          message: reviewReason,
          completedAt: new Date(),
          stagingStorageKey: null,
        },
      })
      await this.storage.delete(stagingStorageKey).catch(() => undefined)
      return this.database.payslipUploadItem.findUniqueOrThrow({
        where: { id: existingItemId ?? (await this.findItemId(batch.id, checksum)) },
        select: batchItemSelect,
      })
    } catch {
      await this.storage.delete(storageKey)
      if (createdPayslipId) {
        await this.database.payslip
          .delete({ where: { id: createdPayslipId } })
          .catch(() => undefined)
      }
      const itemId = existingItemId ?? (await this.findItemId(batch.id, checksum))
      await this.markFailed(itemId, 'PAYSLIP_PROCESSING_FAILED', errorMessage())
      return this.database.payslipUploadItem.findUniqueOrThrow({
        where: { id: itemId },
        select: batchItemSelect,
      })
    }
  }

  private async saveDuplicateItem(
    batchId: string,
    fileName: string,
    checksum: string,
    matchMethod: 'EXACT' | 'NORMALIZED' | 'UNMATCHED',
    duplicateOfPayslipId: string,
    existingItemId?: string,
    employeeId?: string,
  ) {
    const data = {
      originalFileName: fileName,
      checksum,
      status: 'DUPLICATE' as const,
      matchMethod,
      duplicateOfPayslipId,
      payslipId: null,
      errorCode: 'DUPLICATE_PAYSLIP',
      message: 'A document already exists for this period or employee',
      completedAt: new Date(),
      stagingStorageKey: null,
      ...(employeeId ? { message: 'A payslip already exists for this employee and period' } : {}),
    }
    if (existingItemId) {
      return this.database.payslipUploadItem.update({
        where: { id: existingItemId },
        data: { ...data, attemptCount: { increment: 1 } },
        select: batchItemSelect,
      })
    }
    return this.database.payslipUploadItem.create({
      data: { batchId, ...data },
      select: batchItemSelect,
    })
  }

  private async findItemId(batchId: string, checksum: string): Promise<string> {
    const item = await this.database.payslipUploadItem.findFirst({
      where: { batchId, checksum },
      select: { id: true },
    })
    if (!item) throw new Error('Upload item was not stored')
    return item.id
  }

  private async markFailed(itemId: string, code: string, message: string) {
    return this.database.payslipUploadItem.update({
      where: { id: itemId },
      data: {
        status: 'FAILED',
        errorCode: code,
        message: message.slice(0, 255),
        completedAt: new Date(),
      },
      select: batchItemSelect,
    })
  }

  private async refreshBatchStatus(batchId: string) {
    return this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT "id" FROM "PayslipUploadBatch" WHERE "id" = ${batchId} FOR UPDATE`
      const items = await transaction.payslipUploadItem.findMany({
        where: { batchId },
        select: { status: true },
      })
      const status = deriveUploadBatchStatus(items.map((item) => item.status))
      return transaction.payslipUploadBatch.update({
        where: { id: batchId },
        data: {
          status,
          completedAt: status === 'PROCESSING' ? null : new Date(),
        },
      })
    })
  }
}
