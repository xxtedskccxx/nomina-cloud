import { ConflictException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { CompensationsService } from './compensations.service.js'

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
}

const decimal = (value: string) => ({ toFixed: jest.fn<() => string>().mockReturnValue(value) })

describe('CompensationsService', () => {
  it('stores a positive Decimal amount and serializes it as a string', async () => {
    const create = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'compensation-1',
      employmentId: 'employment-1',
      amount: decimal('60000.00'),
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      employment: employmentRecord,
    })
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employment: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(employmentRecord),
      },
      compensation: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
        create,
      },
    }
    const service = new CompensationsService(createDatabase(transaction))

    await expect(
      service.create('employment-1', {
        amount: '60000',
        currency: 'dop',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-01-01',
      }),
    ).resolves.toMatchObject({ data: { amount: '60000.00', currency: 'DOP' } })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employmentId: 'employment-1',
          amount: expect.any(Object),
          currency: 'DOP',
          payFrequency: 'MONTHLY',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        }),
      }),
    )
  })

  it('rejects non-positive amounts and invalid periods before persistence', async () => {
    const database = createDatabase({})
    const service = new CompensationsService(database)

    await expect(
      service.create('employment-1', {
        amount: '0.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-01-01',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_COMPENSATION_AMOUNT' } })

    await expect(
      service.create('employment-1', {
        amount: '50000.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-06-30',
        effectiveTo: '2026-06-01',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_COMPENSATION_PERIOD' } })
  })

  it('rejects overlapping compensation and preserves history when changing salary', async () => {
    const previous = {
      id: 'compensation-1',
      amount: decimal('50000.00'),
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    }
    const update = jest.fn<() => Promise<unknown>>().mockResolvedValue({ ...previous })
    const create = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'compensation-2',
      employmentId: 'employment-1',
      amount: decimal('60000.00'),
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
      effectiveTo: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      employment: employmentRecord,
    })
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employment: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(employmentRecord),
      },
      compensation: {
        findFirst: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce(previous)
          .mockResolvedValueOnce(null),
        update,
        create,
      },
    }
    const service = new CompensationsService(createDatabase(transaction))

    await expect(
      service.create('employment-1', {
        amount: '60000.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-07-01',
      }),
    ).resolves.toMatchObject({ data: { amount: '60000.00' } })

    expect(update).toHaveBeenCalledWith({
      where: { id: 'compensation-1' },
      data: { effectiveTo: new Date('2026-06-30T00:00:00.000Z') },
    })

    const overlapTransaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      employment: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(employmentRecord),
      },
      compensation: {
        findFirst: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(previous),
      },
    }
    const overlapService = new CompensationsService(createDatabase(overlapTransaction))

    await expect(
      overlapService.create('employment-1', {
        amount: '55000.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('resolves inclusive effective-date boundaries', async () => {
    const findFirst = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'compensation-1',
      employmentId: 'employment-1',
      amount: decimal('50000.00'),
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      employment: employmentRecord,
    })
    const database = { compensation: { findFirst } } as unknown as DatabaseClient
    const service = new CompensationsService(database)

    await expect(service.findAt('employment-1', '2026-06-30')).resolves.toMatchObject({
      data: { amount: '50000.00', effectiveTo: '2026-06-30' },
    })
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employmentId: 'employment-1',
          effectiveFrom: { lte: new Date('2026-06-30T00:00:00.000Z') },
        }),
      }),
    )
  })
})
