import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { PayrollPeriodsService } from './payroll-periods.service.js'

const period = {
  id: 'period-1',
  payrollConfigurationId: 'config-1',
  code: '2026-09-01',
  startDate: new Date('2026-09-01T00:00:00.000Z'),
  endDate: new Date('2026-09-15T00:00:00.000Z'),
  paymentDate: new Date('2026-09-16T00:00:00.000Z'),
  status: 'DRAFT',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  openedAt: null,
  openedByUserId: null,
  lockedAt: null,
  lockedByUserId: null,
  reopenedAt: null,
  reopenedByUserId: null,
}

function createDatabase(transaction: Record<string, unknown>): DatabaseClient {
  return {
    $transaction: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockImplementation(async (callback: unknown) => {
        if (typeof callback !== 'function') throw new Error('transaction callback expected')
        return callback(transaction)
      }),
  } as unknown as DatabaseClient
}

describe('PayrollPeriodsService', () => {
  it('rejects invalid calendar ranges before opening a transaction', async () => {
    const database = createDatabase({})
    const service = new PayrollPeriodsService(database)

    await expect(
      service.create({
        payrollConfigurationId: 'config-1',
        code: '2026-09-01',
        startDate: '2026-09-15',
        endDate: '2026-09-01',
        paymentDate: '2026-09-02',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PAYROLL_PERIOD_DATES' } })

    await expect(
      service.create({
        payrollConfigurationId: 'config-1',
        code: '2026-09-01',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        paymentDate: '2026-09-14',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PAYROLL_PERIOD_DATES' } })
  })

  it('rejects overlapping periods and allows adjacent periods', async () => {
    const findFirst = jest.fn<() => Promise<unknown>>().mockResolvedValue(period)
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      payrollConfiguration: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ id: 'config-1', isActive: true }),
      },
      payrollPeriod: { findFirst, create: jest.fn<() => Promise<unknown>>() },
    }
    const service = new PayrollPeriodsService(createDatabase(transaction))

    await expect(
      service.create({
        payrollConfigurationId: 'config-1',
        code: '2026-09-08',
        startDate: '2026-09-08',
        endDate: '2026-09-20',
        paymentDate: '2026-09-21',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PAYROLL_PERIOD_OVERLAP' },
    })

    findFirst.mockResolvedValueOnce(null)
    transaction.payrollPeriod.create = jest.fn<() => Promise<unknown>>().mockResolvedValue(period)
    await expect(
      service.create({
        payrollConfigurationId: 'config-1',
        code: '2026-09-16',
        startDate: '2026-09-16',
        endDate: '2026-09-30',
        paymentDate: '2026-10-01',
      }),
    ).resolves.toMatchObject({ data: { id: 'period-1' } })
  })

  it('enforces lifecycle transitions and requires participants to lock', async () => {
    const update = jest.fn<() => Promise<unknown>>().mockResolvedValue(period)
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      payrollPeriod: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ ...period, status: 'OPEN', participants: [] }),
        update,
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      },
    }
    const service = new PayrollPeriodsService(createDatabase(transaction))

    await expect(service.lock('period-1', 'admin-1')).rejects.toMatchObject({
      response: { code: 'PAYROLL_PERIOD_HAS_NO_PARTICIPANTS' },
    })

    transaction.payrollPeriod.findUnique.mockResolvedValue({
      ...period,
      status: 'DRAFT',
      participants: [],
    })
    await expect(service.lock('period-1', 'admin-1')).rejects.toMatchObject({
      response: { code: 'INVALID_PAYROLL_PERIOD_TRANSITION' },
    })

    transaction.payrollPeriod.findUnique.mockResolvedValue({
      ...period,
      status: 'OPEN',
      participants: [
        {
          employeeId: 'employee-1',
          employmentId: 'employment-1',
          employment: {
            employeeId: 'employee-1',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: null,
          },
        },
      ],
    })
    transaction.payrollPeriod.count.mockResolvedValue(2)
    await expect(service.lock('period-1', 'admin-1')).resolves.toMatchObject({
      data: { id: 'period-1' },
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'period-1' },
        data: expect.objectContaining({ status: 'LOCKED', lockedByUserId: 'admin-1' }),
      }),
    )
  })

  it('rejects refresh and updates after a period is locked', async () => {
    const transaction = {
      $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      payrollPeriod: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue({ ...period, status: 'LOCKED' }),
      },
    }
    const service = new PayrollPeriodsService(createDatabase(transaction))

    await expect(service.refreshParticipants('period-1')).rejects.toMatchObject({
      response: { code: 'PAYROLL_PERIOD_REFRESH_LOCKED' },
    })
    await expect(service.update('period-1', { paymentDate: '2026-09-17' })).rejects.toMatchObject({
      response: { code: 'PAYROLL_PERIOD_LOCKED' },
    })
  })
})
