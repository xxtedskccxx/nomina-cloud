import { NotFoundException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { PositionsService } from './positions.service.js'

describe('PositionsService', () => {
  it('creates a position with an optional department relation', async () => {
    const departmentFindUnique = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'department-1' })
    const create = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'position-1', code: 'DEV' })
    const database = {
      department: { findUnique: departmentFindUnique },
      position: { create },
    } as unknown as DatabaseClient
    const service = new PositionsService(database)

    await service.create({ code: ' dev ', name: ' Developer ', departmentId: 'department-1' })

    expect(create).toHaveBeenCalledWith({
      data: {
        code: 'DEV',
        name: 'Developer',
        department: { connect: { id: 'department-1' } },
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
      },
    })
  })

  it('rejects a position that references an absent department', async () => {
    const departmentFindUnique = jest.fn<() => Promise<unknown>>().mockResolvedValue(null)
    const database = {
      department: { findUnique: departmentFindUnique },
      position: { create: jest.fn<() => Promise<unknown>>() },
    } as unknown as DatabaseClient
    const service = new PositionsService(database)

    await expect(
      service.create({ code: 'DEV', name: 'Developer', departmentId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('passes active and department filters to Prisma', async () => {
    const findMany = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([])
    const database = { position: { findMany } } as unknown as DatabaseClient
    const service = new PositionsService(database)

    await service.findAll({ departmentId: 'department-1', isActive: false })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { departmentId: 'department-1', isActive: false },
      }),
    )
  })
})
