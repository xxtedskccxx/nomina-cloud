import { Body, Controller, Get, Param, Post } from '@nestjs/common'
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
import { CompensationsService } from './compensations.service.js'
import { CreateCompensationDto } from './dto/create-compensation.dto.js'

@ApiTags('compensations')
@Controller()
export class CompensationsController {
  constructor(private readonly compensationsService: CompensationsService) {}

  @Post('employments/:employmentId/compensations')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a compensation history record' })
  @ApiBody({ type: CreateCompensationDto })
  @ApiCreatedResponse({
    description: 'Compensation created with Decimal money serialized as a string',
  })
  @ApiBadRequestResponse({ description: 'Invalid amount, currency, date or period' })
  @ApiConflictResponse({ description: 'Compensation period overlaps an existing record' })
  @ApiNotFoundResponse({ description: 'Employment not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Param('employmentId') employmentId: string, @Body() dto: CreateCompensationDto) {
    return this.compensationsService.create(employmentId, dto)
  }

  @Get('employments/:employmentId/compensations')
  @AdminOnly()
  @ApiOperation({ summary: 'List compensation history for an employment' })
  @ApiResponse({ status: 200, description: 'Compensation history returned' })
  @ApiNotFoundResponse({ description: 'Employment not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findByEmployment(@Param('employmentId') employmentId: string) {
    return this.compensationsService.findByEmployment(employmentId)
  }

  @Get('employees/me/compensation')
  @Authenticated()
  @ApiOperation({ summary: 'Get current compensation for the authenticated employee' })
  @ApiResponse({ status: 200, description: 'Own employment and current compensation returned' })
  @ApiNotFoundResponse({ description: 'No current employment or compensation found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findMine(@CurrentUserId() userId: string) {
    return this.compensationsService.findMine(userId)
  }

  @Get('compensations/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get a compensation record by id' })
  @ApiResponse({ status: 200, description: 'Compensation returned with amount as a string' })
  @ApiNotFoundResponse({ description: 'Compensation not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.compensationsService.findOne(id)
  }
}
