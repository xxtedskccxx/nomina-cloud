import { HttpException, Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT, Prisma } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import {
  addCalendarDays,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from '../common/dates/date-only.js'
import { serializeMoney } from '../common/serializers/money.js'
import { employmentSelect, serializeEmployment } from '../employments/employment.select.js'
import type { CreateCompensationDto } from './dto/create-compensation.dto.js'

const compensationSelect = {
  id: true,
  employmentId: true,
  amount: true,
  currency: true,
  payFrequency: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
  employment: { select: employmentSelect },
} as const

function serializeCompensation<T extends Record<string, unknown>>(compensation: T) {
  return {
    ...compensation,
    amount: serializeMoney(compensation.amount as { toFixed(decimalPlaces: number): string }),
    effectiveFrom: formatDateOnly(compensation.effectiveFrom as Date),
    effectiveTo: compensation.effectiveTo ? formatDateOnly(compensation.effectiveTo as Date) : null,
    createdAt: (compensation.createdAt as Date).toISOString(),
    updatedAt: (compensation.updatedAt as Date).toISOString(),
    ...(compensation.employment
      ? { employment: serializeEmployment(compensation.employment as Record<string, unknown>) }
      : {}),
  }
}

function parseAmount(value: string): Prisma.Decimal {
  try {
    const amount = new Prisma.Decimal(value)
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
      throw new Error('invalid amount')
    }

    return amount
  } catch {
    throw badRequest('INVALID_COMPENSATION_AMOUNT', 'amount must be greater than zero')
  }
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw badRequest('INVALID_CURRENCY', 'currency must be an ISO 4217 three-letter code')
  }

  return currency
}

function validateCompensationPeriod(effectiveFrom: Date, effectiveTo: Date | null): void {
  if (effectiveTo && effectiveFrom > effectiveTo) {
    throw badRequest('INVALID_COMPENSATION_PERIOD', 'effectiveFrom cannot be after effectiveTo')
  }
}

function validateAgainstEmployment(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  employment: { startDate: Date; endDate: Date | null },
): void {
  if (
    effectiveFrom < employment.startDate ||
    (employment.endDate && effectiveFrom > employment.endDate)
  ) {
    throw badRequest(
      'COMPENSATION_OUTSIDE_EMPLOYMENT_PERIOD',
      'Compensation must start within the employment period',
    )
  }

  if (effectiveTo && employment.endDate && effectiveTo > employment.endDate) {
    throw badRequest(
      'COMPENSATION_OUTSIDE_EMPLOYMENT_PERIOD',
      'Compensation must end within the employment period',
    )
  }
}

@Injectable()
export class CompensationsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(employmentId: string, dto: CreateCompensationDto) {
    const amount = parseAmount(dto.amount)
    const currency = normalizeCurrency(dto.currency)
    const effectiveFrom = parseDateOnly(dto.effectiveFrom, 'effectiveFrom')
    const effectiveTo =
      dto.effectiveTo === undefined || dto.effectiveTo === null
        ? null
        : parseDateOnly(dto.effectiveTo, 'effectiveTo')
    validateCompensationPeriod(effectiveFrom, effectiveTo)

    try {
      return await this.database.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT "id" FROM "Employment" WHERE "id" = ${employmentId} FOR UPDATE
        `
        const employment = await transaction.employment.findUnique({
          where: { id: employmentId },
          select: {
            id: true,
            employeeId: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        })

        if (!employment) {
          throw notFound('EMPLOYMENT_NOT_FOUND', 'Employment not found')
        }

        validateAgainstEmployment(effectiveFrom, effectiveTo, employment)

        const previousOpenCompensation = await transaction.compensation.findFirst({
          where: {
            employmentId,
            effectiveTo: null,
            effectiveFrom: { lt: effectiveFrom },
          },
          orderBy: { effectiveFrom: 'desc' },
          select: { id: true },
        })

        const overlappingCompensation = await transaction.compensation.findFirst({
          where: {
            employmentId,
            ...(previousOpenCompensation ? { NOT: { id: previousOpenCompensation.id } } : {}),
            ...(effectiveTo ? { effectiveFrom: { lte: effectiveTo } } : {}),
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
          },
          select: { id: true },
        })

        if (overlappingCompensation) {
          throw conflict(
            'COMPENSATION_PERIOD_OVERLAP',
            'Compensation period overlaps an existing compensation',
          )
        }

        if (previousOpenCompensation) {
          await transaction.compensation.update({
            where: { id: previousOpenCompensation.id },
            data: { effectiveTo: addCalendarDays(effectiveFrom, -1) },
          })
        }

        const compensation = await transaction.compensation.create({
          data: {
            employmentId,
            amount,
            currency,
            payFrequency: dto.payFrequency,
            effectiveFrom,
            effectiveTo,
          },
          select: compensationSelect,
        })

        return { data: serializeCompensation(compensation) }
      })
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async findByEmployment(employmentId: string) {
    const employment = await this.database.employment.findUnique({
      where: { id: employmentId },
      select: { id: true },
    })

    if (!employment) {
      throw notFound('EMPLOYMENT_NOT_FOUND', 'Employment not found')
    }

    const data = await this.database.compensation.findMany({
      where: { employmentId },
      select: compensationSelect,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    })

    return { data: data.map((compensation) => serializeCompensation(compensation)) }
  }

  async findOne(id: string) {
    const compensation = await this.database.compensation.findUnique({
      where: { id },
      select: compensationSelect,
    })

    if (!compensation) {
      throw notFound('COMPENSATION_NOT_FOUND', 'Compensation not found')
    }

    return { data: serializeCompensation(compensation) }
  }

  async findAt(employmentId: string, targetDate: string | Date) {
    const effectiveDate =
      typeof targetDate === 'string' ? parseDateOnly(targetDate, 'targetDate') : targetDate
    const compensation = await this.database.compensation.findFirst({
      where: {
        employmentId,
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
      },
      select: compensationSelect,
      orderBy: { effectiveFrom: 'desc' },
    })

    if (!compensation) {
      throw notFound('COMPENSATION_NOT_FOUND', 'No compensation is effective on that date')
    }

    return { data: serializeCompensation(compensation) }
  }

  async findMine(userId: string) {
    const targetDate = todayDateOnly()
    const employment = await this.database.employment.findFirst({
      where: {
        status: 'ACTIVE',
        startDate: { lte: targetDate },
        OR: [{ endDate: null }, { endDate: { gte: targetDate } }],
        employee: { userId },
      },
      select: employmentSelect,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    if (!employment) {
      throw notFound('ACTIVE_EMPLOYMENT_NOT_FOUND', 'No active employment is linked to this user')
    }

    const compensation = await this.database.compensation.findFirst({
      where: {
        employmentId: employment.id,
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetDate } }],
      },
      select: compensationSelect,
      orderBy: { effectiveFrom: 'desc' },
    })

    if (!compensation) {
      throw notFound('COMPENSATION_NOT_FOUND', 'No current compensation is linked to this user')
    }

    return {
      data: {
        employment: serializeEmployment(employment),
        compensation: serializeCompensation(compensation),
      },
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error
    }

    if (hasDatabaseErrorCode(error, 'P2034')) {
      return conflict(
        'COMPENSATION_TRANSACTION_CONFLICT',
        'Compensation change conflicted with another update',
      )
    }

    return error instanceof Error ? error : new Error('Compensation persistence failed')
  }
}
