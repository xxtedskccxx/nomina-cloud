import { Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import type { CreatePositionDto } from './dto/create-position.dto.js'
import type { PositionListQueryDto } from './dto/position-list-query.dto.js'
import type { UpdatePositionDto } from './dto/update-position.dto.js'

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function normalizeText(value: string): string {
  return value.trim()
}

@Injectable()
export class PositionsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  private async ensureDepartment(departmentId: string | null | undefined): Promise<void> {
    if (!departmentId) {
      return
    }

    const department = await this.database.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    })

    if (!department) {
      throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found')
    }
  }

  async create(dto: CreatePositionDto) {
    await this.ensureDepartment(dto.departmentId)

    try {
      return {
        data: await this.database.position.create({
          data: {
            code: normalizeCode(dto.code),
            name: normalizeText(dto.name),
            ...(dto.description === undefined
              ? {}
              : { description: dto.description?.trim() || null }),
            ...(dto.departmentId ? { department: { connect: { id: dto.departmentId } } } : {}),
          },
          include: {
            department: { select: { id: true, code: true, name: true } },
          },
        }),
      }
    } catch (error) {
      if (hasDatabaseErrorCode(error, 'P2002')) {
        throw conflict('POSITION_CODE_ALREADY_EXISTS', 'Position code already exists')
      }

      throw error
    }
  }

  async findAll(query: PositionListQueryDto = {}) {
    const where = {
      ...(query.departmentId === undefined ? {} : { departmentId: query.departmentId }),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    }
    const data = await this.database.position.findMany({
      where,
      include: {
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return { data }
  }

  async findOne(id: string) {
    const position = await this.database.position.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, code: true, name: true } },
      },
    })

    if (!position) {
      throw notFound('POSITION_NOT_FOUND', 'Position not found')
    }

    return { data: position }
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.ensureDepartment(dto.departmentId)

    const data = {
      ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
      ...(dto.name === undefined ? {} : { name: normalizeText(dto.name) }),
      ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(dto.departmentId === undefined
        ? {}
        : dto.departmentId === null
          ? { department: { disconnect: true } }
          : { department: { connect: { id: dto.departmentId } } }),
    }

    if (Object.keys(data).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      const position = await this.database.position.update({
        where: { id },
        data,
        include: {
          department: { select: { id: true, code: true, name: true } },
        },
      })
      return { data: position }
    } catch (error) {
      if (hasDatabaseErrorCode(error, 'P2002')) {
        throw conflict('POSITION_CODE_ALREADY_EXISTS', 'Position code already exists')
      }

      if (hasDatabaseErrorCode(error, 'P2025')) {
        throw notFound('POSITION_NOT_FOUND', 'Position not found')
      }

      throw error
    }
  }
}
