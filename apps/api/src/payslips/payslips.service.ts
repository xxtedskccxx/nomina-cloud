import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import { ConfigService } from '@nestjs/config'
import { HttpException, Inject, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import type { Environment } from '@payroll/config'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import { FILE_STORAGE } from './file-storage.js'
import type { FileStorage } from './file-storage.js'
import { sanitizeOriginalFileName, sha256, validatePdfUpload } from './pdf-validation.js'
import { PayslipListQueryDto } from './dto/payslip-list-query.dto.js'
import type { MatchPayslipDto } from './dto/match-payslip.dto.js'
import {
  employeeSummarySelect,
  payslipSelect,
  periodSelect,
  serializePayslip,
} from './payslip-shared.js'
import { PayslipUploadBatchesService } from './payslip-upload-batches.service.js'
import { PayslipPublicationService } from './payslip-publication.service.js'

const activeStatuses = [PayslipStatus.DRAFT, PayslipStatus.PUBLISHED] as const

export interface UploadedPayslipFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

@Injectable()
export class PayslipsService {
  private readonly maxFileSizeBytes: number

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    configService: ConfigService<Environment>,
    private readonly batches: PayslipUploadBatchesService,
    private readonly publication: PayslipPublicationService,
    private readonly logger: PinoLogger,
  ) {
    this.maxFileSizeBytes = configService.get('PAYSLIP_MAX_FILE_SIZE_BYTES') ?? 20_000_000
  }

  async upload(
    periodId: string,
    files: UploadedPayslipFile[],
    actorUserId: string,
  ): Promise<{ data: Record<string, unknown> }> {
    return this.batches.uploadLegacy(periodId, files, actorUserId)
  }

  async findAll(periodId: string, query: PayslipListQueryDto = new PayslipListQueryDto()) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id: periodId },
      select: periodSelect,
    })
    if (!period) throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')

    const search = query.search?.trim()
    const where = {
      payrollPeriodId: periodId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.matchStatus ? { matchStatus: query.matchStatus } : {}),
      ...(search
        ? {
            OR: [
              { originalFileName: { contains: search, mode: 'insensitive' as const } },
              {
                employee: {
                  is: {
                    OR: [
                      { employeeCode: { contains: search, mode: 'insensitive' as const } },
                      { firstName: { contains: search, mode: 'insensitive' as const } },
                      { lastName: { contains: search, mode: 'insensitive' as const } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    }
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const [total, records, summary] = await Promise.all([
      this.database.payslip.count({ where }),
      this.database.payslip.findMany({
        where,
        select: payslipSelect,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.getPeriodSummary(periodId),
    ])

    return {
      data: records.map((record) => serializePayslip(record)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
      summary,
    }
  }

  private async getPeriodSummary(periodId: string) {
    const [participants, payslips] = await Promise.all([
      this.database.payrollParticipant.findMany({
        where: { payrollPeriodId: periodId },
        select: { employeeId: true },
      }),
      this.database.payslip.findMany({
        where: { payrollPeriodId: periodId },
        select: { employeeId: true, status: true, matchStatus: true },
      }),
    ])
    const currentPayslips = payslips.filter(
      (payslip) =>
        payslip.employeeId !== null &&
        activeStatuses.includes(payslip.status as (typeof activeStatuses)[number]),
    )
    const participantIds = new Set(participants.map((participant) => participant.employeeId))
    const currentEmployeeIds = new Set(
      currentPayslips.map((payslip) => payslip.employeeId as string),
    )
    const uploadedEmployeeIds = new Set(
      currentPayslips
        .filter((payslip) => participantIds.has(payslip.employeeId as string))
        .map((payslip) => payslip.employeeId as string),
    )
    const statusCount = (status: PayslipStatus) =>
      payslips.filter((payslip) => payslip.status === status).length
    return {
      participants: participants.length,
      expected: participants.length,
      payslips: payslips.length,
      uploaded: uploadedEmployeeIds.size,
      published: statusCount(PayslipStatus.PUBLISHED),
      draft: statusCount(PayslipStatus.DRAFT),
      archived: statusCount(PayslipStatus.ARCHIVED),
      needsReview: payslips.filter(
        (payslip) =>
          payslip.status === PayslipStatus.DRAFT &&
          payslip.matchStatus !== PayslipMatchStatus.MATCHED,
      ).length,
      missing: [...participantIds].filter((id) => !currentEmployeeIds.has(id)).length,
    }
  }

  async findMissing(periodId: string, query: PayslipListQueryDto = new PayslipListQueryDto()) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    })
    if (!period) throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')

    const [participants, currentPayslips] = await Promise.all([
      this.database.payrollParticipant.findMany({
        where: { payrollPeriodId: periodId },
        select: { employee: { select: employeeSummarySelect } },
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
      }),
      this.database.payslip.findMany({
        where: {
          payrollPeriodId: periodId,
          status: { in: [...activeStatuses] },
          employeeId: { not: null },
        },
        select: { employeeId: true },
      }),
    ])
    const currentEmployeeIds = new Set(currentPayslips.map((payslip) => payslip.employeeId))
    const search = query.search?.trim().toLowerCase()
    const missing = participants
      .map((participant) => participant.employee)
      .filter((employee) => !currentEmployeeIds.has(employee.id))
      .filter((employee) => {
        if (!search) return true
        return [employee.employeeCode, employee.firstName, employee.lastName].some((value) =>
          value.toLowerCase().includes(search),
        )
      })
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const total = missing.length
    return {
      data: missing.slice((page - 1) * pageSize, page * pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(id: string) {
    const payslip = await this.database.payslip.findUnique({ where: { id }, select: payslipSelect })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    return { data: serializePayslip(payslip) }
  }

  async match(id: string, dto: MatchPayslipDto, actorUserId: string) {
    try {
      const result = await this.database.$transaction(async (transaction) => {
        const current = await transaction.payslip.findUnique({
          where: { id },
          select: { id: true, payrollPeriodId: true, status: true },
        })
        if (!current) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
        if (current.status !== PayslipStatus.DRAFT) {
          throw conflict('PAYSLIP_NOT_EDITABLE', 'Only draft payslips can be matched')
        }
        const employee = await transaction.employee.findUnique({
          where: { id: dto.employeeId },
          select: employeeSummarySelect,
        })
        if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', 'Employee not found')
        const participant = await transaction.payrollParticipant.findFirst({
          where: { payrollPeriodId: current.payrollPeriodId, employeeId: dto.employeeId },
          select: { id: true },
        })
        if (!participant) {
          throw conflict(
            'PAYSLIP_EMPLOYEE_NOT_IN_PERIOD',
            'The selected employee is not included in this payroll period',
          )
        }
        const duplicate = await transaction.payslip.findFirst({
          where: {
            id: { not: id },
            payrollPeriodId: current.payrollPeriodId,
            employeeId: dto.employeeId,
            status: { in: [...activeStatuses] },
          },
          select: { id: true },
        })
        if (duplicate) {
          throw conflict(
            'DUPLICATE_PAYSLIP',
            'A payslip already exists for this employee and period',
          )
        }
        const payslip = await transaction.payslip.update({
          where: { id },
          data: {
            employeeId: dto.employeeId,
            matchStatus: PayslipMatchStatus.MATCHED,
            matchMethod: 'MANUAL',
            reviewReason: null,
          },
          select: payslipSelect,
        })
        const uploadItem = await transaction.payslipUploadItem.findUnique({
          where: { payslipId: id },
          select: { id: true },
        })
        if (uploadItem) {
          await transaction.payslipUploadItem.update({
            where: { id: uploadItem.id },
            data: {
              status: 'COMPLETED',
              matchMethod: 'MANUAL',
              message: null,
              completedAt: new Date(),
            },
          })
        }
        return { data: serializePayslip(payslip) }
      })
      await this.batches.refreshForPayslip(id)
      this.logger.info(
        { actorUserId, payslipId: id, employeeId: dto.employeeId },
        'Payslip manually matched',
      )
      return result
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async publish(id: string, actorUserId: string) {
    return this.publication.publish(id, actorUserId)
  }

  async publishAll(periodId: string, actorUserId: string) {
    return this.publication.publishAll(periodId, actorUserId)
  }

  async archive(id: string, actorUserId: string) {
    const payslip = await this.database.payslip.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    if (payslip.status !== PayslipStatus.PUBLISHED) {
      throw conflict('PAYSLIP_NOT_PUBLISHED', 'Only published payslips can be archived')
    }
    try {
      const updated = await this.database.payslip.update({
        where: { id },
        data: {
          status: PayslipStatus.ARCHIVED,
          archivedAt: new Date(),
          archivedByUserId: actorUserId,
        },
        select: payslipSelect,
      })
      this.logger.info({ actorUserId, payslipId: id }, 'Payslip archived')
      return { data: serializePayslip(updated) }
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async remove(id: string, actorUserId: string) {
    const payslip = await this.database.payslip.findUnique({
      where: { id },
      select: { status: true, storageKey: true },
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw conflict('PAYSLIP_NOT_DRAFT', 'Only draft payslips can be deleted')
    }
    await this.database.payslip.delete({ where: { id } })
    await this.storage.delete(payslip.storageKey)
    this.logger.info({ actorUserId, payslipId: id }, 'Draft payslip deleted')
    return { data: { id, deleted: true } }
  }

  async replace(id: string, file: UploadedPayslipFile, actorUserId: string) {
    if (!file) throw badRequest('PAYSLIP_FILE_REQUIRED', 'A replacement PDF file is required')
    const validation = validatePdfUpload(file, this.maxFileSizeBytes)
    if (!validation.valid) throw badRequest(validation.code, validation.message)
    const checksum = sha256(file.buffer)
    const current = await this.database.payslip.findUnique({
      where: { id },
      select: { id: true, employeeId: true, payrollPeriodId: true, status: true },
    })
    if (!current) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    if (
      !current.employeeId ||
      !activeStatuses.includes(current.status as (typeof activeStatuses)[number])
    ) {
      throw conflict('PAYSLIP_NOT_REPLACEABLE', 'Only an active matched payslip can be replaced')
    }
    const duplicate = await this.database.payslip.findFirst({
      where: { payrollPeriodId: current.payrollPeriodId, checksum, id: { not: id } },
      select: { id: true },
    })
    if (duplicate)
      throw conflict('DUPLICATE_PAYSLIP', 'A document with the same content already exists')

    const storageKey = `${current.payrollPeriodId}/${randomUUID()}.pdf`
    await this.storage.put(storageKey, file.buffer)
    try {
      const replacement = await this.database.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT "id" FROM "PayrollPeriod" WHERE "id" = ${current.payrollPeriodId} FOR UPDATE
        `
        const existing = await transaction.payslip.findUnique({
          where: { id },
          select: { id: true, employeeId: true, payrollPeriodId: true, status: true },
        })
        if (
          !existing ||
          !existing.employeeId ||
          !activeStatuses.includes(existing.status as (typeof activeStatuses)[number])
        ) {
          throw conflict(
            'PAYSLIP_NOT_REPLACEABLE',
            'Only an active matched payslip can be replaced',
          )
        }
        await transaction.payslip.update({
          where: { id },
          data: {
            status: PayslipStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedByUserId: actorUserId,
          },
        })
        return transaction.payslip.create({
          data: {
            employeeId: existing.employeeId,
            payrollPeriodId: existing.payrollPeriodId,
            originalFileName: sanitizeOriginalFileName(file.originalname),
            storageKey,
            mimeType: 'application/pdf',
            fileSize: file.buffer.byteLength,
            checksum,
            status: PayslipStatus.DRAFT,
            matchStatus: PayslipMatchStatus.MATCHED,
            matchMethod: 'MANUAL',
            uploadedByUserId: actorUserId,
            replacedPayslipId: id,
          },
          select: payslipSelect,
        })
      })
      this.logger.info(
        { actorUserId, payslipId: id, replacementId: replacement.id },
        'Payslip replaced',
      )
      return { data: serializePayslip(replacement) }
    } catch (error) {
      try {
        await this.storage.delete(storageKey)
      } catch (cleanupError) {
        this.logger.warn({ payslipId: id, cleanupError }, 'Replacement storage cleanup failed')
      }
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async findMine(userId: string, query: PayslipListQueryDto = new PayslipListQueryDto()) {
    const employee = await this.database.employee.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!employee)
      throw notFound('EMPLOYEE_PROFILE_NOT_FOUND', 'No employee profile is linked to this user')
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = { employeeId: employee.id, status: PayslipStatus.PUBLISHED }
    const [total, records] = await Promise.all([
      this.database.payslip.count({ where }),
      this.database.payslip.findMany({
        where,
        select: payslipSelect,
        orderBy: [{ payrollPeriod: { paymentDate: 'desc' } }, { publishedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      data: records.map((record) => serializePayslip(record)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  async findMineOne(userId: string, id: string) {
    const employee = await this.database.employee.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!employee)
      throw notFound('EMPLOYEE_PROFILE_NOT_FOUND', 'No employee profile is linked to this user')
    const payslip = await this.database.payslip.findFirst({
      where: { id, employeeId: employee.id, status: PayslipStatus.PUBLISHED },
      select: payslipSelect,
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    return { data: serializePayslip(payslip) }
  }

  async getAdminFile(
    id: string,
  ): Promise<{ stream: Readable; fileName: string; fileSize: number }> {
    const payslip = await this.database.payslip.findUnique({
      where: { id },
      select: { originalFileName: true, fileSize: true, storageKey: true },
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    return {
      stream: await this.getStorageStream(payslip.storageKey),
      fileName: payslip.originalFileName,
      fileSize: payslip.fileSize,
    }
  }

  async getMineFile(
    userId: string,
    id: string,
  ): Promise<{ stream: Readable; fileName: string; fileSize: number }> {
    const employee = await this.database.employee.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!employee)
      throw notFound('EMPLOYEE_PROFILE_NOT_FOUND', 'No employee profile is linked to this user')
    const payslip = await this.database.payslip.findFirst({
      where: { id, employeeId: employee.id, status: PayslipStatus.PUBLISHED },
      select: { originalFileName: true, fileSize: true, storageKey: true },
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    return {
      stream: await this.getStorageStream(payslip.storageKey),
      fileName: payslip.originalFileName,
      fileSize: payslip.fileSize,
    }
  }

  private async getStorageStream(storageKey: string): Promise<Readable> {
    try {
      return await this.storage.get(storageKey)
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'PAYSLIP_FILE_NOT_FOUND'
      ) {
        throw notFound('PAYSLIP_FILE_NOT_FOUND', 'Payslip file is not available')
      }
      throw error
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) return error
    if (hasDatabaseErrorCode(error, 'P2002')) {
      return conflict('DUPLICATE_PAYSLIP', 'A payslip already exists for this employee and period')
    }
    if (hasDatabaseErrorCode(error, 'P2025')) {
      return notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    }
    return error instanceof Error ? error : new Error('Payslip persistence failed')
  }
}
