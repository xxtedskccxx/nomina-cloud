import { HttpException, Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient, Prisma } from '@payroll/database'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import type { PayrollConfigurationListQueryDto } from './dto/payroll-configuration-list-query.dto.js'
import type { CreatePayrollConfigurationDto } from './dto/create-payroll-configuration.dto.js'
import type { UpdatePayrollConfigurationDto } from './dto/update-payroll-configuration.dto.js'

type ConfigurationTransaction = Prisma.TransactionClient

const configurationSelect = {
  id: true,
  code: true,
  name: true,
  currency: true,
  payFrequency: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

function normalizeCode(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeText(value: string): string {
  return value.trim()
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase()
}

async function lockConfiguration(
  transaction: ConfigurationTransaction,
  configurationId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT "id" FROM "PayrollConfiguration" WHERE "id" = ${configurationId} FOR UPDATE
  `
}

@Injectable()
export class PayrollConfigurationsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(dto: CreatePayrollConfigurationDto) {
    try {
      const data = await this.database.payrollConfiguration.create({
        data: {
          code: normalizeCode(dto.code),
          name: normalizeText(dto.name),
          currency: normalizeCurrency(dto.currency),
          payFrequency: dto.payFrequency,
          isActive: dto.isActive ?? true,
        },
        select: configurationSelect,
      })

      return { data }
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async findAll(query: PayrollConfigurationListQueryDto = {}) {
    const data = await this.database.payrollConfiguration.findMany({
      where: query.isActive === undefined ? {} : { isActive: query.isActive },
      select: configurationSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return { data }
  }

  async findOne(id: string) {
    const data = await this.database.payrollConfiguration.findUnique({
      where: { id },
      select: configurationSelect,
    })

    if (!data) {
      throw notFound('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration not found')
    }

    return { data }
  }

  async update(id: string, dto: UpdatePayrollConfigurationDto) {
    if (Object.keys(dto).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      return await this.database.$transaction(async (transaction) => {
        await lockConfiguration(transaction, id)
        const current = await transaction.payrollConfiguration.findUnique({
          where: { id },
          select: { ...configurationSelect, _count: { select: { periods: true } } },
        })

        if (!current) {
          throw notFound('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration not found')
        }

        if (
          current._count.periods > 0 &&
          (dto.code !== undefined || dto.currency !== undefined || dto.payFrequency !== undefined)
        ) {
          throw conflict(
            'PAYROLL_CONFIGURATION_HAS_PERIODS',
            'Code, currency and payFrequency cannot change after periods exist',
          )
        }

        const data = {
          ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
          ...(dto.name === undefined ? {} : { name: normalizeText(dto.name) }),
          ...(dto.currency === undefined ? {} : { currency: normalizeCurrency(dto.currency) }),
          ...(dto.payFrequency === undefined ? {} : { payFrequency: dto.payFrequency }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        }

        const configuration = await transaction.payrollConfiguration.update({
          where: { id },
          data,
          select: configurationSelect,
        })

        return { data: configuration }
      })
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      throw this.mapPersistenceError(error)
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error
    }

    if (hasDatabaseErrorCode(error, 'P2002')) {
      return conflict(
        'PAYROLL_CONFIGURATION_CODE_ALREADY_EXISTS',
        'Payroll configuration code already exists',
      )
    }

    if (hasDatabaseErrorCode(error, 'P2025')) {
      return notFound('PAYROLL_CONFIGURATION_NOT_FOUND', 'Payroll configuration not found')
    }

    return error instanceof Error ? error : new Error('Payroll configuration persistence failed')
  }
}
