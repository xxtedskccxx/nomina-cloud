import { HttpException, Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient, Prisma } from '@payroll/database'
import { EmploymentRecordStatus } from '@payroll/contracts'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import { parseDateOnly } from '../common/dates/date-only.js'
import { employmentSelect, serializeEmployment } from './employment.select.js'
import type { CreateEmploymentDto } from './dto/create-employment.dto.js'
import type { EndEmploymentDto } from './dto/end-employment.dto.js'
import type { UpdateEmploymentDto } from './dto/update-employment.dto.js'

type EmploymentTransaction = Prisma.TransactionClient

function validateEmploymentPeriod(startDate: Date, endDate: Date | null, status: string): void {
  if (endDate && startDate > endDate) {
    throw badRequest('INVALID_EMPLOYMENT_PERIOD', 'startDate cannot be after endDate')
  }

  if (status === EmploymentRecordStatus.ENDED && !endDate) {
    throw badRequest(
      'ENDED_EMPLOYMENT_REQUIRES_END_DATE',
      'An ended employment must have an endDate',
    )
  }
}

async function lockEmployee(transaction: EmploymentTransaction, employeeId: string): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE
  `
}

async function lockEmployment(
  transaction: EmploymentTransaction,
  employmentId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "Employment" WHERE "id" = ${employmentId} FOR UPDATE
  `
}

@Injectable()
export class EmploymentsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(employeeId: string, dto: CreateEmploymentDto) {
    const startDate = parseDateOnly(dto.startDate, 'startDate')
    const endDate = dto.endDate ? parseDateOnly(dto.endDate, 'endDate') : null
    const status = dto.status ?? EmploymentRecordStatus.ACTIVE
    validateEmploymentPeriod(startDate, endDate, status)

    try {
      return await this.database.$transaction(async (transaction) => {
        await lockEmployee(transaction, employeeId)
        const employee = await transaction.employee.findUnique({
          where: { id: employeeId },
          select: { id: true },
        })

        if (!employee) {
          throw notFound('EMPLOYEE_NOT_FOUND', 'Employee not found')
        }

        if (status === EmploymentRecordStatus.ACTIVE) {
          const activeEmployment = await transaction.employment.findFirst({
            where: { employeeId, status: EmploymentRecordStatus.ACTIVE },
            select: { id: true },
          })

          if (activeEmployment) {
            throw conflict('EMPLOYMENT_ALREADY_ACTIVE', 'Employee already has an active employment')
          }
        }

        const employment = await transaction.employment.create({
          data: {
            employeeId,
            employmentType: dto.employmentType,
            startDate,
            ...(endDate ? { endDate } : {}),
            status,
          },
          select: employmentSelect,
        })

        return { data: serializeEmployment(employment) }
      })
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async findByEmployee(employeeId: string) {
    const data = await this.database.employment.findMany({
      where: { employeeId },
      select: employmentSelect,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    return { data: data.map((employment) => serializeEmployment(employment)) }
  }

  async findMine(userId: string) {
    const employment = await this.database.employment.findFirst({
      where: {
        status: EmploymentRecordStatus.ACTIVE,
        employee: { userId },
      },
      select: employmentSelect,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    if (!employment) {
      throw notFound('ACTIVE_EMPLOYMENT_NOT_FOUND', 'No active employment is linked to this user')
    }

    return { data: serializeEmployment(employment) }
  }

  async findOne(id: string) {
    const employment = await this.database.employment.findUnique({
      where: { id },
      select: employmentSelect,
    })

    if (!employment) {
      throw notFound('EMPLOYMENT_NOT_FOUND', 'Employment not found')
    }

    return { data: serializeEmployment(employment) }
  }

  async update(id: string, dto: UpdateEmploymentDto) {
    if (Object.keys(dto).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      return await this.database.$transaction(async (transaction) => {
        await lockEmployment(transaction, id)
        const currentEmployment = await transaction.employment.findUnique({
          where: { id },
          select: {
            id: true,
            employeeId: true,
            employmentType: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        })

        if (!currentEmployment) {
          throw notFound('EMPLOYMENT_NOT_FOUND', 'Employment not found')
        }

        const startDate = dto.startDate
          ? parseDateOnly(dto.startDate, 'startDate')
          : currentEmployment.startDate
        const endDate =
          dto.endDate === undefined
            ? currentEmployment.endDate
            : dto.endDate
              ? parseDateOnly(dto.endDate, 'endDate')
              : null
        const status = dto.status ?? currentEmployment.status
        validateEmploymentPeriod(startDate, endDate, status)

        if (status === EmploymentRecordStatus.ACTIVE) {
          const activeEmployment = await transaction.employment.findFirst({
            where: {
              employeeId: currentEmployment.employeeId,
              status: EmploymentRecordStatus.ACTIVE,
              NOT: { id },
            },
            select: { id: true },
          })

          if (activeEmployment) {
            throw conflict('EMPLOYMENT_ALREADY_ACTIVE', 'Employee already has an active employment')
          }
        }

        const employment = await transaction.employment.update({
          where: { id },
          data: {
            ...(dto.employmentType ? { employmentType: dto.employmentType } : {}),
            ...(dto.startDate ? { startDate } : {}),
            ...(dto.endDate === undefined ? {} : { endDate }),
            ...(dto.status ? { status } : {}),
          },
          select: employmentSelect,
        })

        return { data: serializeEmployment(employment) }
      })
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async end(id: string, dto: EndEmploymentDto) {
    const endDate = parseDateOnly(dto.endDate, 'endDate')

    try {
      return await this.database.$transaction(async (transaction) => {
        await lockEmployment(transaction, id)
        const currentEmployment = await transaction.employment.findUnique({
          where: { id },
          select: {
            id: true,
            employeeId: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        })

        if (!currentEmployment) {
          throw notFound('EMPLOYMENT_NOT_FOUND', 'Employment not found')
        }

        if (currentEmployment.status === EmploymentRecordStatus.ENDED) {
          throw conflict('EMPLOYMENT_ALREADY_ENDED', 'Employment is already ended')
        }

        validateEmploymentPeriod(currentEmployment.startDate, endDate, EmploymentRecordStatus.ENDED)

        const futureCompensation = await transaction.compensation.findFirst({
          where: { employmentId: id, effectiveFrom: { gt: endDate } },
          select: { id: true },
        })
        const compensationBeyondEnd = await transaction.compensation.findFirst({
          where: { employmentId: id, effectiveTo: { gt: endDate } },
          select: { id: true },
        })

        if (futureCompensation || compensationBeyondEnd) {
          throw badRequest(
            'INVALID_EMPLOYMENT_PERIOD',
            'Employment cannot end before its compensation history ends',
          )
        }

        const employment = await transaction.employment.update({
          where: { id },
          data: { endDate, status: EmploymentRecordStatus.ENDED },
          select: employmentSelect,
        })

        await transaction.compensation.updateMany({
          where: { employmentId: id, effectiveTo: null },
          data: { effectiveTo: endDate },
        })

        return { data: serializeEmployment(employment) }
      })
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error
    }

    if (hasDatabaseErrorCode(error, 'P2002')) {
      return conflict('EMPLOYMENT_ALREADY_ACTIVE', 'Employee already has an active employment')
    }

    if (hasDatabaseErrorCode(error, 'P2034')) {
      return conflict(
        'EMPLOYMENT_TRANSACTION_CONFLICT',
        'Employment change conflicted with another update',
      )
    }

    return error instanceof Error ? error : new Error('Employment persistence failed')
  }
}
