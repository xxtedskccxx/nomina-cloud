import { HttpException, Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient, Prisma } from '@payroll/database'
import { PayrollCompensationCoverage, PayrollPeriodStatus } from '@payroll/contracts'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import { formatDateOnly, parseDateOnly } from '../common/dates/date-only.js'
import { serializeMoney } from '../common/serializers/money.js'
import type { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js'
import { PayrollParticipantListQueryDto } from './dto/payroll-participant-list-query.dto.js'
import { PayrollPeriodListQueryDto } from './dto/payroll-period-list-query.dto.js'
import type { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto.js'

type PeriodTransaction = Prisma.TransactionClient

const configurationSummarySelect = {
  id: true,
  code: true,
  name: true,
  currency: true,
  payFrequency: true,
} as const

const periodSelect = {
  id: true,
  payrollConfigurationId: true,
  code: true,
  startDate: true,
  endDate: true,
  paymentDate: true,
  status: true,
  openedAt: true,
  openedByUserId: true,
  lockedAt: true,
  lockedByUserId: true,
  reopenedAt: true,
  reopenedByUserId: true,
  createdAt: true,
  updatedAt: true,
  payrollConfiguration: { select: configurationSummarySelect },
} as const

const participantSelect = {
  id: true,
  payrollPeriodId: true,
  employeeId: true,
  employmentId: true,
  compensationId: true,
  compensationCoverage: true,
  createdAt: true,
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  employment: {
    select: {
      id: true,
      employeeId: true,
      employmentType: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  },
  compensation: {
    select: {
      id: true,
      amount: true,
      currency: true,
      payFrequency: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  },
} as const

type PeriodRecord = Prisma.PayrollPeriodGetPayload<{ select: typeof periodSelect }>
type ParticipantRecord = Prisma.PayrollParticipantGetPayload<{ select: typeof participantSelect }>

function normalizeCode(value: string): string {
  return value.trim().toUpperCase()
}

function validatePeriodDates(startDate: Date, endDate: Date, paymentDate: Date): void {
  if (startDate > endDate || paymentDate < endDate) {
    throw badRequest(
      'INVALID_PAYROLL_PERIOD_DATES',
      'startDate must be on or before endDate and paymentDate must be on or after endDate',
    )
  }
}

function serializePeriod(period: PeriodRecord) {
  return {
    ...period,
    startDate: formatDateOnly(period.startDate),
    endDate: formatDateOnly(period.endDate),
    paymentDate: formatDateOnly(period.paymentDate),
    openedAt: period.openedAt?.toISOString() ?? null,
    lockedAt: period.lockedAt?.toISOString() ?? null,
    reopenedAt: period.reopenedAt?.toISOString() ?? null,
  }
}

function serializeParticipant(participant: ParticipantRecord) {
  return {
    ...participant,
    employment: participant.employment
      ? {
          ...participant.employment,
          startDate: formatDateOnly(participant.employment.startDate),
          endDate: participant.employment.endDate
            ? formatDateOnly(participant.employment.endDate)
            : null,
        }
      : null,
    compensation: participant.compensation
      ? {
          ...participant.compensation,
          amount: serializeMoney(participant.compensation.amount),
          effectiveFrom: formatDateOnly(participant.compensation.effectiveFrom),
          effectiveTo: participant.compensation.effectiveTo
            ? formatDateOnly(participant.compensation.effectiveTo)
            : null,
        }
      : null,
  }
}

async function lockPeriod(transaction: PeriodTransaction, periodId: string): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "PayrollPeriod" WHERE "id" = ${periodId} FOR UPDATE
  `
}

function isEmploymentEligible(
  employment: { startDate: Date; endDate: Date | null },
  startDate: Date,
  endDate: Date,
): boolean {
  return employment.startDate <= endDate && (!employment.endDate || employment.endDate >= startDate)
}

function resolveEmployment<
  T extends {
    id: string
    employeeId: string
    status: string
  },
>(employments: T[], employeeId: string): T {
  const candidates = employments.filter((employment) => employment.employeeId === employeeId)
  if (candidates.length === 1 && candidates[0]) return candidates[0]

  const activeCandidates = candidates.filter((employment) => employment.status === 'ACTIVE')
  if (activeCandidates.length === 1 && activeCandidates[0]) return activeCandidates[0]

  throw conflict(
    'PAYROLL_PERIOD_EMPLOYMENT_AMBIGUOUS',
    'More than one eligible employment exists for an employee in this period',
  )
}

@Injectable()
export class PayrollPeriodsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(dto: CreatePayrollPeriodDto) {
    const startDate = parseDateOnly(dto.startDate, 'startDate')
    const endDate = parseDateOnly(dto.endDate, 'endDate')
    const paymentDate = parseDateOnly(dto.paymentDate, 'paymentDate')
    validatePeriodDates(startDate, endDate, paymentDate)

    try {
      return await this.database.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT "id" FROM "PayrollConfiguration" WHERE "id" = ${dto.payrollConfigurationId} FOR UPDATE
        `
        const configuration = await transaction.payrollConfiguration.findUnique({
          where: { id: dto.payrollConfigurationId },
          select: { id: true, isActive: true },
        })

        if (!configuration) {
          throw notFound('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration not found')
        }
        if (!configuration.isActive) {
          throw conflict(
            'PAYROLL_CONFIGURATION_INACTIVE',
            'Inactive configurations cannot create periods',
          )
        }

        const overlappingPeriod = await transaction.payrollPeriod.findFirst({
          where: {
            payrollConfigurationId: dto.payrollConfigurationId,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          select: { id: true },
        })

        if (overlappingPeriod) {
          throw conflict('PAYROLL_PERIOD_OVERLAP', 'Payroll period overlaps an existing period')
        }

        const period = await transaction.payrollPeriod.create({
          data: {
            payrollConfigurationId: dto.payrollConfigurationId,
            code: normalizeCode(dto.code),
            startDate,
            endDate,
            paymentDate,
          },
          select: periodSelect,
        })

        return { data: serializePeriod(period) }
      })
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async findAll(query: PayrollPeriodListQueryDto = new PayrollPeriodListQueryDto()) {
    const from = query.from ? parseDateOnly(query.from, 'from') : undefined
    const to = query.to ? parseDateOnly(query.to, 'to') : undefined
    if (from && to && from > to) {
      throw badRequest('INVALID_PAYROLL_PERIOD_DATES', 'from cannot be after to')
    }

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = {
      ...(query.payrollConfigurationId
        ? { payrollConfigurationId: query.payrollConfigurationId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(from ? { startDate: { gte: from } } : {}),
      ...(to ? { endDate: { lte: to } } : {}),
    }
    const [total, data] = await Promise.all([
      this.database.payrollPeriod.count({ where }),
      this.database.payrollPeriod.findMany({
        where,
        select: periodSelect,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      data: data.map((item) => serializePeriod(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(id: string) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id },
      select: periodSelect,
    })
    if (!period) {
      throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
    }

    return { data: serializePeriod(period) }
  }

  async update(id: string, dto: UpdatePayrollPeriodDto) {
    if (Object.keys(dto).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      return await this.database.$transaction(async (transaction) => {
        await lockPeriod(transaction, id)
        const current = await transaction.payrollPeriod.findUnique({
          where: { id },
          select: {
            ...periodSelect,
            payrollConfiguration: { select: { id: true, isActive: true } },
          },
        })
        if (!current) {
          throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
        }
        if (current.status !== PayrollPeriodStatus.DRAFT) {
          throw conflict('PAYROLL_PERIOD_LOCKED', 'Only draft payroll periods can be updated')
        }
        await transaction.$executeRaw`
          SELECT "id" FROM "PayrollConfiguration" WHERE "id" = ${current.payrollConfigurationId} FOR UPDATE
        `

        const startDate = dto.startDate
          ? parseDateOnly(dto.startDate, 'startDate')
          : current.startDate
        const endDate = dto.endDate ? parseDateOnly(dto.endDate, 'endDate') : current.endDate
        const paymentDate = dto.paymentDate
          ? parseDateOnly(dto.paymentDate, 'paymentDate')
          : current.paymentDate
        validatePeriodDates(startDate, endDate, paymentDate)

        const overlappingPeriod = await transaction.payrollPeriod.findFirst({
          where: {
            payrollConfigurationId: current.payrollConfigurationId,
            id: { not: id },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          select: { id: true },
        })
        if (overlappingPeriod) {
          throw conflict('PAYROLL_PERIOD_OVERLAP', 'Payroll period overlaps an existing period')
        }

        const period = await transaction.payrollPeriod.update({
          where: { id },
          data: {
            ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
            ...(dto.startDate === undefined ? {} : { startDate }),
            ...(dto.endDate === undefined ? {} : { endDate }),
            ...(dto.paymentDate === undefined ? {} : { paymentDate }),
          },
          select: periodSelect,
        })

        return { data: serializePeriod(period) }
      })
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async open(id: string, actorUserId: string) {
    return this.transition(id, PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.OPEN, actorUserId)
  }

  async lock(id: string, actorUserId: string) {
    try {
      return await this.database.$transaction(async (transaction) => {
        await lockPeriod(transaction, id)
        const current = await transaction.payrollPeriod.findUnique({
          where: { id },
          select: {
            ...periodSelect,
            participants: {
              select: {
                employeeId: true,
                employmentId: true,
                employment: { select: { employeeId: true, startDate: true, endDate: true } },
              },
            },
          },
        })
        if (!current) {
          throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
        }
        if (current.status !== PayrollPeriodStatus.OPEN) {
          throw conflict('INVALID_PAYROLL_PERIOD_TRANSITION', 'Only open periods can be locked')
        }
        if (current.participants.length === 0) {
          throw conflict(
            'PAYROLL_PERIOD_HAS_NO_PARTICIPANTS',
            'A period needs participants before locking',
          )
        }
        const invalidParticipant = current.participants.find(
          (participant) =>
            participant.employment.employeeId !== participant.employeeId ||
            !isEmploymentEligible(participant.employment, current.startDate, current.endDate),
        )
        if (invalidParticipant) {
          throw conflict(
            'PAYROLL_PARTICIPANT_NOT_ELIGIBLE',
            'Every participant must remain eligible for the period',
          )
        }

        const period = await transaction.payrollPeriod.update({
          where: { id },
          data: {
            status: PayrollPeriodStatus.LOCKED,
            lockedAt: new Date(),
            lockedByUserId: actorUserId,
          },
          select: periodSelect,
        })
        return { data: serializePeriod(period) }
      })
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async reopen(id: string, actorUserId: string) {
    return this.transition(
      id,
      PayrollPeriodStatus.LOCKED,
      PayrollPeriodStatus.OPEN,
      actorUserId,
      true,
    )
  }

  private async transition(
    id: string,
    expectedStatus: PayrollPeriodStatus,
    nextStatus: PayrollPeriodStatus,
    actorUserId: string,
    isReopen = false,
  ) {
    try {
      return await this.database.$transaction(async (transaction) => {
        await lockPeriod(transaction, id)
        const current = await transaction.payrollPeriod.findUnique({
          where: { id },
          select: periodSelect,
        })
        if (!current) {
          throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
        }
        if (current.status !== expectedStatus) {
          throw conflict(
            'INVALID_PAYROLL_PERIOD_TRANSITION',
            'Payroll period transition is not allowed',
          )
        }

        const now = new Date()
        const period = await transaction.payrollPeriod.update({
          where: { id },
          data: isReopen
            ? { status: nextStatus, reopenedAt: now, reopenedByUserId: actorUserId }
            : { status: nextStatus, openedAt: now, openedByUserId: actorUserId },
          select: periodSelect,
        })
        return { data: serializePeriod(period) }
      })
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async refreshParticipants(id: string) {
    try {
      return await this.database.$transaction(async (transaction) => {
        await lockPeriod(transaction, id)
        const current = await transaction.payrollPeriod.findUnique({
          where: { id },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        })
        if (!current) {
          throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
        }
        if (current.status === PayrollPeriodStatus.LOCKED) {
          throw conflict(
            'PAYROLL_PERIOD_REFRESH_LOCKED',
            'Locked periods cannot refresh participants',
          )
        }

        const employments = await transaction.employment.findMany({
          where: {
            startDate: { lte: current.endDate },
            OR: [{ endDate: null }, { endDate: { gte: current.startDate } }],
          },
          select: {
            id: true,
            employeeId: true,
            employmentType: true,
            startDate: true,
            endDate: true,
            status: true,
            employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
            compensations: {
              where: {
                effectiveFrom: { lte: current.endDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: current.startDate } }],
              },
              select: {
                id: true,
                amount: true,
                currency: true,
                payFrequency: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
              orderBy: { effectiveFrom: 'asc' },
            },
          },
        })

        const byEmployee = new Map<string, typeof employments>()
        for (const employment of employments) {
          const employeeEmployments = byEmployee.get(employment.employeeId) ?? []
          byEmployee.set(employment.employeeId, [...employeeEmployments, employment])
        }

        const participantData = [...byEmployee.entries()].map(([employeeId, records]) => {
          const employment = resolveEmployment(records, employeeId)
          const coveringCompensations = employment.compensations
          const onlyCompensation = coveringCompensations[0]
          const compensation =
            coveringCompensations.length === 1 &&
            onlyCompensation &&
            onlyCompensation.effectiveFrom <= current.startDate &&
            (!onlyCompensation.effectiveTo || onlyCompensation.effectiveTo >= current.endDate)
              ? onlyCompensation
              : null
          const compensationCoverage =
            coveringCompensations.length === 0
              ? PayrollCompensationCoverage.NONE
              : compensation
                ? PayrollCompensationCoverage.SINGLE
                : PayrollCompensationCoverage.MULTIPLE

          return {
            payrollPeriodId: id,
            employeeId,
            employmentId: employment.id,
            compensationId: compensation?.id ?? null,
            compensationCoverage,
          }
        })

        await transaction.payrollParticipant.deleteMany({ where: { payrollPeriodId: id } })
        if (participantData.length > 0) {
          await transaction.payrollParticipant.createMany({ data: participantData })
        }

        const participants = await transaction.payrollParticipant.findMany({
          where: { payrollPeriodId: id },
          select: participantSelect,
          orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
        })

        return {
          data: participants.map((participant) => serializeParticipant(participant)),
          count: participants.length,
        }
      })
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async findParticipants(
    id: string,
    query: PayrollParticipantListQueryDto = new PayrollParticipantListQueryDto(),
  ) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!period) {
      throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
    }

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = { payrollPeriodId: id }
    const [total, participants] = await Promise.all([
      this.database.payrollParticipant.count({ where }),
      this.database.payrollParticipant.findMany({
        where,
        select: participantSelect,
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      data: participants.map((participant) => serializeParticipant(participant)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) return error
    if (hasDatabaseErrorCode(error, 'P2002')) {
      return conflict('PAYROLL_PERIOD_CODE_ALREADY_EXISTS', 'Payroll period code already exists')
    }
    if (hasDatabaseErrorCode(error, 'P2025')) {
      return notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
    }
    if (hasDatabaseErrorCode(error, 'P2034')) {
      return conflict(
        'PAYROLL_PERIOD_TRANSACTION_CONFLICT',
        'Payroll period update conflicted with another update',
      )
    }
    return error instanceof Error ? error : new Error('Payroll period persistence failed')
  }
}
