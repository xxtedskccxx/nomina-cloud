import { ConflictException, NotFoundException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { DepartmentsService } from './departments.service.js'

describe('DepartmentsService', () => {
  it('normalizes department codes before persisting them', async () => {
    const create = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'department-1', code: 'FIN' })
    const database = { department: { create } } as unknown as DatabaseClient
    const service = new DepartmentsService(database)

    await service.create({ code: ' fin ', name: ' Finance ' })

    expect(create).toHaveBeenCalledWith({
      data: { code: 'FIN', name: 'Finance' },
    })
  })

  it('maps duplicate codes to a conflict error', async () => {
    const create = jest.fn<() => Promise<unknown>>().mockRejectedValue({ code: 'P2002' })
    const database = { department: { create } } as unknown as DatabaseClient
    const service = new DepartmentsService(database)

    await expect(service.create({ code: 'FIN', name: 'Finance' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    await expect(service.create({ code: 'FIN', name: 'Finance' })).rejects.toMatchObject({
      response: { code: 'DEPARTMENT_CODE_ALREADY_EXISTS' },
    })
  })

  it('maps an absent department on update to not found', async () => {
    const update = jest.fn<() => Promise<unknown>>().mockRejectedValue({ code: 'P2025' })
    const database = { department: { update } } as unknown as DatabaseClient
    const service = new DepartmentsService(database)

    await expect(service.update('missing', { name: 'Finance' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('returns departments in the shared data envelope', async () => {
    const findMany = jest
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'department-1', code: 'FIN' }])
    const database = { department: { findMany } } as unknown as DatabaseClient
    const service = new DepartmentsService(database)

    await expect(service.findAll()).resolves.toEqual({
      data: [{ id: 'department-1', code: 'FIN' }],
    })
  })
})
