import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
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
import { CurrentUserId } from '../auth/current-user.decorator.js'
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js'
import { PayrollParticipantListQueryDto } from './dto/payroll-participant-list-query.dto.js'
import { PayrollPeriodListQueryDto } from './dto/payroll-period-list-query.dto.js'
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto.js'
import { PayrollPeriodsService } from './payroll-periods.service.js'

@ApiTags('payroll-periods')
@Controller('payroll-periods')
@AdminOnly()
export class PayrollPeriodsController {
  constructor(private readonly service: PayrollPeriodsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft payroll period' })
  @ApiCreatedResponse({ description: 'Payroll period created' })
  @ApiBadRequestResponse({ description: 'Invalid period dates or payload' })
  @ApiConflictResponse({ description: 'Period overlaps or code already exists' })
  @ApiNotFoundResponse({ description: 'Payroll configuration not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Body() dto: CreatePayrollPeriodDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'List payroll periods with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Payroll periods returned' })
  @ApiBadRequestResponse({ description: 'Invalid date filter' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll(@Query() query: PayrollPeriodListQueryDto) {
    return this.service.findAll(query)
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'List participants for a payroll period' })
  @ApiResponse({ status: 200, description: 'Payroll participants returned' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findParticipants(@Param('id') id: string, @Query() query: PayrollParticipantListQueryDto) {
    return this.service.findParticipants(id, query)
  }

  @Post(':id/participants/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile eligible participants for a draft or open period' })
  @ApiResponse({ status: 200, description: 'Participants refreshed idempotently' })
  @ApiConflictResponse({ description: 'Period is locked or employment eligibility is ambiguous' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  refreshParticipants(@Param('id') id: string) {
    return this.service.refreshParticipants(id)
  }

  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open a draft payroll period' })
  @ApiResponse({ status: 200, description: 'Payroll period opened' })
  @ApiConflictResponse({ description: 'Invalid payroll period transition' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  open(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.open(id, actorUserId)
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock an open payroll period' })
  @ApiResponse({ status: 200, description: 'Payroll period locked' })
  @ApiConflictResponse({
    description: 'Invalid transition, no participants or invalid participant',
  })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  lock(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.lock(id, actorUserId)
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a locked payroll period for an explicit correction' })
  @ApiResponse({ status: 200, description: 'Payroll period reopened' })
  @ApiConflictResponse({ description: 'Only locked periods can be reopened' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  reopen(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.reopen(id, actorUserId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payroll period by id' })
  @ApiResponse({ status: 200, description: 'Payroll period returned' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft payroll period' })
  @ApiResponse({ status: 200, description: 'Payroll period updated' })
  @ApiBadRequestResponse({ description: 'Invalid period dates or payload' })
  @ApiConflictResponse({ description: 'Period is locked or overlaps another period' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdatePayrollPeriodDto) {
    return this.service.update(id, dto)
  }
}
