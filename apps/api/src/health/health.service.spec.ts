import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { HealthService } from './health.service.js'

describe('HealthService', () => {
  it('returns a stable liveness payload', () => {
    const database = {} as DatabaseClient
    const service = new HealthService(database)

    expect(service.getHealth()).toEqual({ status: 'ok', service: 'payroll-api' })
  })

  it('reports database readiness after a successful query', async () => {
    const queryRaw = jest.fn<() => Promise<unknown>>()
    queryRaw.mockResolvedValue([{ '?column?': 1 }])
    const database = {
      $queryRaw: queryRaw,
    } as unknown as DatabaseClient
    const service = new HealthService(database)

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ok',
      service: 'payroll-api',
      database: 'ok',
    })
  })

  it('maps database errors to service unavailable', async () => {
    const queryRaw = jest.fn<() => Promise<unknown>>()
    queryRaw.mockRejectedValue(new Error('connection refused'))
    const database = {
      $queryRaw: queryRaw,
    } as unknown as DatabaseClient
    const service = new HealthService(database)

    await expect(service.getReadiness()).rejects.toMatchObject({
      response: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not ready',
      },
      status: 503,
    })
  })
})
