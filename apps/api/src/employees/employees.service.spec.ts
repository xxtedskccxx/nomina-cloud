import { NotFoundException } from '@nestjs/common'
import { jest } from '@jest/globals'
import type { DatabaseClient } from '@payroll/database'
import { EmployeesService } from './employees.service.js'

describe('EmployeesService', () => {
  it('creates an employee without requiring a portal user', async () => {
    const create = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'employee-1', userId: null })
    const database = {
      employee: { create },
      department: { findUnique: jest.fn<() => Promise<unknown>>() },
      position: { findUnique: jest.fn<() => Promise<unknown>>() },
      user: { findUnique: jest.fn<() => Promise<unknown>>() },
    } as unknown as DatabaseClient
    const service = new EmployeesService(database)

    await service.create({
      employeeCode: ' emp-00001 ',
      firstName: 'Ada',
      lastName: 'Lovelace',
      hireDate: '2025-01-01',
    })

    expect(create).toHaveBeenCalledWith({
      data: {
        employeeCode: 'EMP-00001',
        firstName: 'Ada',
        lastName: 'Lovelace',
        hireDate: new Date('2025-01-01'),
      },
      select: expect.any(Object),
    })
  })

  it('rejects a user already linked to another employee', async () => {
    const database = {
      employee: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'other-employee' }),
        create: jest.fn<() => Promise<unknown>>(),
      },
      department: { findUnique: jest.fn<() => Promise<unknown>>() },
      position: { findUnique: jest.fn<() => Promise<unknown>>() },
      user: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'user-1' }) },
    } as unknown as DatabaseClient
    const service = new EmployeesService(database)

    await expect(
      service.create({
        employeeCode: 'EMP-00001',
        firstName: 'Ada',
        lastName: 'Lovelace',
        hireDate: '2025-01-01',
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'USER_ALREADY_LINKED_TO_EMPLOYEE' },
      status: 409,
    })
  })

  it('returns the authenticated employee profile by session user id', async () => {
    const findUnique = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'employee-1', userId: 'user-1' })
    const database = { employee: { findUnique } } as unknown as DatabaseClient
    const service = new EmployeesService(database)

    await expect(service.findMine('user-1')).resolves.toEqual({
      data: { id: 'employee-1', userId: 'user-1' },
    })
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: expect.any(Object),
    })
  })

  it('maps a missing own profile to not found', async () => {
    const database = {
      employee: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
    } as unknown as DatabaseClient
    const service = new EmployeesService(database)

    await expect(service.findMine('user-1')).rejects.toBeInstanceOf(NotFoundException)
  })
})
