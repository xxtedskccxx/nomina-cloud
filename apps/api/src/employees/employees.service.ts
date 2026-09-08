import { Inject, Injectable } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import {
  badRequest,
  conflict,
  hasDatabaseErrorCode,
  notFound,
} from '../common/errors/domain-errors.js'
import type { CreateEmployeeDto } from './dto/create-employee.dto.js'
import { EmployeeListQueryDto } from './dto/employee-list-query.dto.js'
import type { UpdateEmployeeDto } from './dto/update-employee.dto.js'

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  middleName: true,
  preferredName: true,
  email: true,
  phone: true,
  documentType: true,
  documentNumber: true,
  hireDate: true,
  terminationDate: true,
  status: true,
  departmentId: true,
  positionId: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, name: true, email: true, username: true, role: true } },
} as const

function normalizeCode(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeText(value: string): string {
  return value.trim()
}

function normalizeOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  return value?.trim() || null
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined
  }

  return value === null ? null : new Date(value)
}

function getUniqueTarget(error: unknown): string[] {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return []
  }

  const meta = error.meta
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) {
    return []
  }

  if (typeof meta.target === 'string') {
    return [meta.target]
  }

  return Array.isArray(meta.target)
    ? meta.target.filter((value): value is string => typeof value === 'string')
    : []
}

@Injectable()
export class EmployeesService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  private async validateRelations(
    departmentId: string | null | undefined,
    positionId: string | null | undefined,
    userId: string | null | undefined,
    currentEmployeeId?: string,
  ): Promise<void> {
    const [department, position, user] = await Promise.all([
      departmentId
        ? this.database.department.findUnique({ where: { id: departmentId }, select: { id: true } })
        : null,
      positionId
        ? this.database.position.findUnique({ where: { id: positionId }, select: { id: true } })
        : null,
      userId
        ? this.database.user.findUnique({ where: { id: userId }, select: { id: true } })
        : null,
    ])

    if (departmentId && !department) {
      throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found')
    }

    if (positionId && !position) {
      throw notFound('POSITION_NOT_FOUND', 'Position not found')
    }

    if (userId && !user) {
      throw notFound('USER_NOT_FOUND', 'User not found')
    }

    if (userId) {
      const linkedEmployee = await this.database.employee.findUnique({
        where: { userId },
        select: { id: true },
      })

      if (linkedEmployee && linkedEmployee.id !== currentEmployeeId) {
        throw conflict('USER_ALREADY_LINKED_TO_EMPLOYEE', 'User is already linked to an employee')
      }
    }
  }

  private validateDocument(
    documentType: string | null | undefined,
    documentNumber: string | null | undefined,
  ): void {
    if (Boolean(documentType) !== Boolean(documentNumber)) {
      throw badRequest(
        'DOCUMENT_FIELDS_MUST_MATCH',
        'documentType and documentNumber must be provided together',
      )
    }
  }

  private validateDates(hireDate: Date, terminationDate: Date | null | undefined): void {
    if (terminationDate && terminationDate < hireDate) {
      throw badRequest(
        'TERMINATION_DATE_BEFORE_HIRE_DATE',
        'terminationDate cannot be before hireDate',
      )
    }
  }

  async create(dto: CreateEmployeeDto) {
    const departmentId = dto.departmentId || undefined
    const positionId = dto.positionId || undefined
    const userId = dto.userId || undefined
    const hireDate = new Date(dto.hireDate)
    const terminationDate = parseDate(dto.terminationDate)
    const documentType = dto.documentType ? normalizeCode(dto.documentType) : undefined
    const documentNumber = dto.documentNumber?.trim() || undefined

    this.validateDocument(documentType, documentNumber)
    this.validateDates(hireDate, terminationDate)
    await this.validateRelations(departmentId, positionId, userId)

    try {
      const employee = await this.database.employee.create({
        data: {
          employeeCode: normalizeCode(dto.employeeCode),
          firstName: normalizeText(dto.firstName),
          lastName: normalizeText(dto.lastName),
          ...(dto.middleName === undefined
            ? {}
            : { middleName: normalizeOptionalText(dto.middleName) }),
          ...(dto.preferredName === undefined
            ? {}
            : { preferredName: normalizeOptionalText(dto.preferredName) }),
          ...(dto.email === undefined ? {} : { email: normalizeOptionalText(dto.email) }),
          ...(dto.phone === undefined ? {} : { phone: normalizeOptionalText(dto.phone) }),
          ...(documentType === undefined ? {} : { documentType }),
          ...(documentNumber === undefined ? {} : { documentNumber }),
          hireDate,
          ...(terminationDate === undefined ? {} : { terminationDate }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
          ...(positionId ? { position: { connect: { id: positionId } } } : {}),
          ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
        select: employeeSelect,
      })

      return { data: employee }
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  async findAll(query: EmployeeListQueryDto = new EmployeeListQueryDto()) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const search = query.search?.trim()
    const where = {
      ...(search
        ? {
            OR: [
              { employeeCode: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.departmentId === undefined ? {} : { departmentId: query.departmentId }),
      ...(query.positionId === undefined ? {} : { positionId: query.positionId }),
    }
    const [total, data] = await Promise.all([
      this.database.employee.count({ where }),
      this.database.employee.findMany({
        where,
        select: employeeSelect,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(id: string) {
    const employee = await this.database.employee.findUnique({
      where: { id },
      select: employeeSelect,
    })

    if (!employee) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'Employee not found')
    }

    return { data: employee }
  }

  async findMine(userId: string) {
    const employee = await this.database.employee.findUnique({
      where: { userId },
      select: employeeSelect,
    })

    if (!employee) {
      throw notFound('EMPLOYEE_PROFILE_NOT_FOUND', 'No employee profile is linked to this user')
    }

    return { data: employee }
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const currentEmployee = await this.database.employee.findUnique({
      where: { id },
      select: {
        id: true,
        hireDate: true,
        terminationDate: true,
        documentType: true,
        documentNumber: true,
      },
    })

    if (!currentEmployee) {
      throw notFound('EMPLOYEE_NOT_FOUND', 'Employee not found')
    }

    const departmentId = dto.departmentId === undefined ? undefined : dto.departmentId || null
    const positionId = dto.positionId === undefined ? undefined : dto.positionId || null
    const userId = dto.userId === undefined ? undefined : dto.userId || null
    const hireDate = dto.hireDate === undefined ? currentEmployee.hireDate : new Date(dto.hireDate)
    const terminationDate = parseDate(dto.terminationDate)
    const nextTerminationDate =
      dto.terminationDate === undefined ? currentEmployee.terminationDate : terminationDate
    const documentType =
      dto.documentType === undefined
        ? currentEmployee.documentType
        : dto.documentType
          ? normalizeCode(dto.documentType)
          : null
    const documentNumber =
      dto.documentNumber === undefined
        ? currentEmployee.documentNumber
        : dto.documentNumber?.trim() || null

    this.validateDocument(documentType, documentNumber)
    this.validateDates(hireDate, nextTerminationDate)
    await this.validateRelations(departmentId, positionId, userId, id)

    const data = {
      ...(dto.employeeCode === undefined ? {} : { employeeCode: normalizeCode(dto.employeeCode) }),
      ...(dto.firstName === undefined ? {} : { firstName: normalizeText(dto.firstName) }),
      ...(dto.lastName === undefined ? {} : { lastName: normalizeText(dto.lastName) }),
      ...(dto.middleName === undefined
        ? {}
        : { middleName: normalizeOptionalText(dto.middleName) }),
      ...(dto.preferredName === undefined
        ? {}
        : { preferredName: normalizeOptionalText(dto.preferredName) }),
      ...(dto.email === undefined ? {} : { email: normalizeOptionalText(dto.email) }),
      ...(dto.phone === undefined ? {} : { phone: normalizeOptionalText(dto.phone) }),
      ...(dto.documentType === undefined ? {} : { documentType }),
      ...(dto.documentNumber === undefined ? {} : { documentNumber }),
      ...(dto.hireDate === undefined ? {} : { hireDate }),
      ...(dto.terminationDate === undefined ? {} : { terminationDate }),
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(dto.departmentId === undefined
        ? {}
        : dto.departmentId === null
          ? { department: { disconnect: true } }
          : { department: { connect: { id: dto.departmentId } } }),
      ...(dto.positionId === undefined
        ? {}
        : dto.positionId === null
          ? { position: { disconnect: true } }
          : { position: { connect: { id: dto.positionId } } }),
      ...(dto.userId === undefined
        ? {}
        : dto.userId === null
          ? { user: { disconnect: true } }
          : { user: { connect: { id: dto.userId } } }),
    }

    if (Object.keys(data).length === 0) {
      throw badRequest('NO_FIELDS_TO_UPDATE', 'At least one field is required')
    }

    try {
      const employee = await this.database.employee.update({
        where: { id },
        data,
        select: employeeSelect,
      })
      return { data: employee }
    } catch (error) {
      throw this.mapPersistenceError(error)
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (hasDatabaseErrorCode(error, 'P2002')) {
      const target = getUniqueTarget(error)
      const targetDescription = target.join(' ').toLowerCase()
      const errorDescription = error instanceof Error ? error.message.toLowerCase() : ''
      if (targetDescription.includes('employeecode') || errorDescription.includes('employeecode')) {
        return conflict('EMPLOYEE_CODE_ALREADY_EXISTS', 'Employee code already exists')
      }

      if (targetDescription.includes('userid') || errorDescription.includes('userid')) {
        return conflict('USER_ALREADY_LINKED_TO_EMPLOYEE', 'User is already linked to an employee')
      }

      if (
        targetDescription.includes('documenttype') ||
        targetDescription.includes('documentnumber') ||
        errorDescription.includes('documenttype') ||
        errorDescription.includes('documentnumber')
      ) {
        return conflict('DOCUMENT_ALREADY_EXISTS', 'Document is already assigned to an employee')
      }

      return conflict('EMPLOYEE_ALREADY_EXISTS', 'Employee conflicts with an existing record')
    }

    if (hasDatabaseErrorCode(error, 'P2025')) {
      return notFound('EMPLOYEE_NOT_FOUND', 'Employee not found')
    }

    return error instanceof Error ? error : new Error('Employee persistence failed')
  }
}
