import { ConflictException, NotFoundException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { EmploymentsService } from './employments.service.js'

function createDatabase(transaction: Record<string, unknown>): DatabaseClient {
  const database = {
    $transaction: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockImplementation(async (callback: unknown) => {
        if (typeof callback !== 'function') {
          throw new Error('transaction callback expected')
        }

        return callback(transaction)
      }),
  }

  return database as unknown as DatabaseClient
}

const employmentRecord = {
  id: 'employment-1',
  employeeId: 'employee-1',
  employmentType: 'FULL_TIME',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  employee: {
    id: 'employee-1',
    employeeCode: 'EMP-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    department: null,
    position: null,
  },
}

describe('EmploymentsService', () => {
  it('creates a valid employment with date-only persistence', async () => {
    const create = jest.fn<() => Promise<unknown>>().mockResolvedValue(employmentRecord)
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employee: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          id: 'employee-1',
          status: 'ACTIVE',
        }),
      },
      employment: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
        create,
      },
    }
    const service = new EmploymentsService(createDatabase(transaction))

    await service.create('employee-1', {
      employmentType: 'FULL_TIME',
      startDate: '2026-01-01',
    })

    expect(create).toHaveBeenCalledWith({
      data: {
        employeeId: 'employee-1',
        employmentType: 'FULL_TIME',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
      },
      select: expect.any(Object),
    })
  })

  it('rejects an absent employee and a second active employment', async () => {
    const absentTransaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      employee: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
      employment: { findFirst: jest.fn<() => Promise<unknown>>() },
    }
    const absentService = new EmploymentsService(createDatabase(absentTransaction))

    await expect(
      absentService.create('missing', {
        employmentType: 'FULL_TIME',
        startDate: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)

    const activeTransaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employee: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          id: 'employee-1',
          status: 'ACTIVE',
        }),
      },
      employment: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'existing' }),
      },
    }
    const activeService = new EmploymentsService(createDatabase(activeTransaction))

    await expect(
      activeService.create('employee-1', {
        employmentType: 'PART_TIME',
        startDate: '2026-02-01',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'EMPLOYMENT_ALREADY_ACTIVE' },
    })
  })

  it('rejects invalid ranges and requires an end date for ended employment', async () => {
    const database = createDatabase({})
    const service = new EmploymentsService(database)

    await expect(
      service.create('employee-1', {
        employmentType: 'FULL_TIME',
        startDate: '2026-06-01',
        endDate: '2026-05-31',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_EMPLOYMENT_PERIOD' },
    })

    await expect(
      service.create('employee-1', {
        employmentType: 'FULL_TIME',
        startDate: '2026-01-01',
        status: 'ENDED',
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'ENDED_EMPLOYMENT_REQUIRES_END_DATE' },
    })
  })

  it('ends an active employment and closes its open compensation atomically', async () => {
    const update = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ...employmentRecord,
      status: 'ENDED',
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    })
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employee: { findUnique: jest.fn<() => Promise<unknown>>() },
      employment: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(employmentRecord),
        update,
      },
      compensation: {
        findFirst: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        updateMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
      },
    }
    const service = new EmploymentsService(createDatabase(transaction))

    await service.end('employment-1', { endDate: '2026-06-30' })

    expect(update).toHaveBeenCalledWith({
      where: { id: 'employment-1' },
      data: { endDate: new Date('2026-06-30T00:00:00.000Z'), status: 'ENDED' },
      select: expect.any(Object),
    })
    expect(transaction.compensation.updateMany).toHaveBeenCalledWith({
      where: { employmentId: 'employment-1', effectiveTo: null },
      data: { effectiveTo: new Date('2026-06-30T00:00:00.000Z') },
    })
  })

  it('maps an ended employment to a conflict', async () => {
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employment: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          ...employmentRecord,
          status: 'ENDED',
          endDate: new Date('2026-06-30T00:00:00.000Z'),
        }),
      },
    }
    const service = new EmploymentsService(createDatabase(transaction))

    await expect(service.end('employment-1', { endDate: '2026-06-30' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })
})
