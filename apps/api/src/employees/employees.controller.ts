import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AdminOnly, Authenticated } from '../auth/authorization.decorator.js'
import { CurrentUserId } from '../auth/current-user.decorator.js'
import { CreateEmployeeDto } from './dto/create-employee.dto.js'
import { EmployeeListQueryDto } from './dto/employee-list-query.dto.js'
import { UpdateEmployeeDto } from './dto/update-employee.dto.js'
import { EmployeesService } from './employees.service.js'

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Create an employee, optionally linked to a user' })
  @ApiCreatedResponse({ description: 'Employee created' })
  @ApiBadRequestResponse({ description: 'Invalid employee payload' })
  @ApiConflictResponse({ description: 'Employee code, document or user link already exists' })
  @ApiNotFoundResponse({ description: 'Department, position or user not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto)
  }

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'List employees with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20, maximum: 100 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'] })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'positionId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Employees and pagination metadata returned' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll(@Query() query: EmployeeListQueryDto) {
    return this.employeesService.findAll(query)
  }

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'Get the authenticated employee profile' })
  @ApiResponse({ status: 200, description: 'Own employee profile returned' })
  @ApiNotFoundResponse({ description: 'No employee profile linked to the session user' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  getMine(@CurrentUserId() userId: string) {
    return this.employeesService.findMine(userId)
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get an employee by id' })
  @ApiResponse({ status: 200, description: 'Employee returned' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id)
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an employee or link/unlink its user' })
  @ApiResponse({ status: 200, description: 'Employee updated' })
  @ApiBadRequestResponse({ description: 'Invalid employee payload' })
  @ApiConflictResponse({ description: 'Employee code, document or user link already exists' })
  @ApiNotFoundResponse({ description: 'Employee, department, position or user not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto)
  }
}
