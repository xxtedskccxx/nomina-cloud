import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AdminOnly, Authenticated } from '../auth/authorization.decorator.js'
import { CurrentUserId } from '../auth/current-user.decorator.js'
import { CreateEmploymentDto } from './dto/create-employment.dto.js'
import { EndEmploymentDto } from './dto/end-employment.dto.js'
import { UpdateEmploymentDto } from './dto/update-employment.dto.js'
import { EmploymentsService } from './employments.service.js'

@ApiTags('employments')
@Controller()
export class EmploymentsController {
  constructor(private readonly employmentsService: EmploymentsService) {}

  @Post('employees/:employeeId/employments')
  @AdminOnly()
  @ApiOperation({ summary: 'Create an employment for an employee' })
  @ApiBody({ type: CreateEmploymentDto })
  @ApiCreatedResponse({ description: 'Employment created with date-only fields' })
  @ApiBadRequestResponse({ description: 'Invalid employment period or payload' })
  @ApiConflictResponse({ description: 'Employee already has an active employment' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Param('employeeId') employeeId: string, @Body() dto: CreateEmploymentDto) {
    return this.employmentsService.create(employeeId, dto)
  }

  @Get('employees/:employeeId/employments')
  @AdminOnly()
  @ApiOperation({ summary: 'List employment history for an employee' })
  @ApiResponse({ status: 200, description: 'Employment history returned' })
  @ApiNotFoundResponse({ description: 'Employee not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.employmentsService.findByEmployee(employeeId)
  }

  @Get('employees/me/employment')
  @Authenticated()
  @ApiOperation({ summary: 'Get the current employment of the authenticated employee' })
  @ApiResponse({ status: 200, description: 'Own active employment returned' })
  @ApiNotFoundResponse({ description: 'No active employment linked to the session user' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findMine(@CurrentUserId() userId: string) {
    return this.employmentsService.findMine(userId)
  }

  @Get('employments/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get an employment by id' })
  @ApiResponse({ status: 200, description: 'Employment returned' })
  @ApiNotFoundResponse({ description: 'Employment not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.employmentsService.findOne(id)
  }

  @Patch('employments/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update an employment record' })
  @ApiBody({ type: UpdateEmploymentDto })
  @ApiResponse({ status: 200, description: 'Employment updated' })
  @ApiBadRequestResponse({ description: 'Invalid employment period or payload' })
  @ApiConflictResponse({ description: 'Employee already has another active employment' })
  @ApiNotFoundResponse({ description: 'Employment not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdateEmploymentDto) {
    return this.employmentsService.update(id, dto)
  }

  @Post('employments/:id/end')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End an employment and close open compensation' })
  @ApiBody({ type: EndEmploymentDto })
  @ApiResponse({ status: 200, description: 'Employment ended' })
  @ApiBadRequestResponse({ description: 'Invalid employment period' })
  @ApiConflictResponse({ description: 'Employment is already ended' })
  @ApiNotFoundResponse({ description: 'Employment not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  end(@Param('id') id: string, @Body() dto: EndEmploymentDto) {
    return this.employmentsService.end(id, dto)
  }
}
