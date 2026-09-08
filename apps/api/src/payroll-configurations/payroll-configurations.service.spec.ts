import { ConflictException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { PayrollConfigurationsService } from './payroll-configurations.service.js'

describe('PayrollConfigurationsService', () => {
  it('normalizes configuration codes and creates an active configuration', async () => {
    const create = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'config-1',
      code: 'REGULAR_MONTHLY',
      name: 'Monthly payroll',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      isActive: true,
    })
    const database = {
      payrollConfiguration: { create },
    } as unknown as DatabaseClient
    const service = new PayrollConfigurationsService(database)

    await expect(
      service.create({
        code: ' regular_monthly ',
        name: ' Monthly payroll ',
        currency: 'dop',
        payFrequency: 'MONTHLY',
      }),
    ).resolves.toMatchObject({ data: { code: 'REGULAR_MONTHLY', currency: 'DOP' } })

    expect(create).toHaveBeenCalledWith({
      data: {
        code: 'REGULAR_MONTHLY',
        name: 'Monthly payroll',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        isActive: true,
      },
      select: expect.any(Object),
    })
  })

  it('maps a duplicate configuration code to a domain conflict', async () => {
    const database = {
      payrollConfiguration: {
        create: jest.fn<() => Promise<unknown>>().mockRejectedValue({ code: 'P2002' }),
      },
    } as unknown as DatabaseClient
    const service = new PayrollConfigurationsService(database)

    await expect(
      service.create({
        code: 'REGULAR_MONTHLY',
        name: 'Monthly payroll',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PAYROLL_CONFIGURATION_CODE_ALREADY_EXISTS' },
    })
  })

  it('blocks structural changes once periods exist', async () => {
    const database = {
      $transaction: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockImplementation(async (callback: unknown) => {
          if (typeof callback !== 'function') throw new Error('transaction callback expected')
          return callback({
            $executeRaw: jest.fn<() => Promise<number>>().mockResolvedValue(1),
            payrollConfiguration: {
              findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
                id: 'config-1',
                code: 'REGULAR_MONTHLY',
                name: 'Monthly payroll',
                currency: 'DOP',
                payFrequency: 'MONTHLY',
                isActive: true,
                _count: { periods: 1 },
              }),
              update: jest.fn<() => Promise<unknown>>(),
            },
          })
        }),
    } as unknown as DatabaseClient
    const service = new PayrollConfigurationsService(database)

    await expect(service.update('config-1', { currency: 'USD' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    await expect(service.update('config-1', { currency: 'USD' })).rejects.toMatchObject({
      response: { code: 'PAYROLL_CONFIGURATION_HAS_PERIODS' },
    })
  })
})
