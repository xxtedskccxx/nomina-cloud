import { Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import type { CreateDepartmentDto } from './dto/create-department.dto.js'
import type { UpdateDepartmentDto } from './dto/update-department.dto.js'

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function normalizeText(value: string): string {
  return value.trim()
}

@Injectable()
export class DepartmentsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(dto: CreateDepartmentDto) {
    try {
      return await this.database.department.create({
        data: {
          code: normalizeCode(dto.code),
          name: normalizeText(dto.name),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() || null }),
        },
      })
    } catch (error) {
      if (hasDatabaseErrorCode(error, 'P2002')) {
        throw conflict('DEPARTMENT_CODE_ALREADY_EXISTS', 'Department code already exists')
      }

      throw error
    }
  }

  async findAll() {
    const data = await this.database.department.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return { data }
  }

  async findOne(id: string) {
    const department = await this.database.department.findUnique({ where: { id } })

    if (!department) {
      throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found')
    }

    return { data: department }
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const data = {
      ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
      ...(dto.name === undefined ? {} : { name: normalizeText(dto.name) }),
      ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    }

    if (Object.keys(data).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      const department = await this.database.department.update({ where: { id }, data })
      return { data: department }
    } catch (error) {
      if (hasDatabaseErrorCode(error, 'P2002')) {
        throw conflict('DEPARTMENT_CODE_ALREADY_EXISTS', 'Department code already exists')
      }

      if (hasDatabaseErrorCode(error, 'P2025')) {
        throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found')
      }

      throw error
    }
  }
}
