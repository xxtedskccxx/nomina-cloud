import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AdminOnly } from '../auth/authorization.decorator.js'
import { CreateDepartmentDto } from './dto/create-department.dto.js'
import { UpdateDepartmentDto } from './dto/update-department.dto.js'
import { DepartmentsService } from './departments.service.js'

@ApiTags('departments')
@Controller('departments')
@AdminOnly()
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a department' })
  @ApiCreatedResponse({ description: 'Department created' })
  @ApiBadRequestResponse({ description: 'Invalid department payload' })
  @ApiConflictResponse({ description: 'Department code already exists' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  async create(@Body() dto: CreateDepartmentDto) {
    return { data: await this.departmentsService.create(dto) }
  }

  @Get()
  @ApiOperation({ summary: 'List departments' })
  @ApiResponse({ status: 200, description: 'Departments returned' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll() {
    return this.departmentsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a department by id' })
  @ApiResponse({ status: 200, description: 'Department returned' })
  @ApiNotFoundResponse({ description: 'Department not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate a department' })
  @ApiResponse({ status: 200, description: 'Department updated' })
  @ApiBadRequestResponse({ description: 'Invalid department payload' })
  @ApiConflictResponse({ description: 'Department code already exists' })
  @ApiNotFoundResponse({ description: 'Department not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto)
  }
}
