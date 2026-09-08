import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
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
import { CreatePayrollConfigurationDto } from './dto/create-payroll-configuration.dto.js'
import { PayrollConfigurationListQueryDto } from './dto/payroll-configuration-list-query.dto.js'
import { UpdatePayrollConfigurationDto } from './dto/update-payroll-configuration.dto.js'
import { PayrollConfigurationsService } from './payroll-configurations.service.js'

@ApiTags('payroll-configurations')
@Controller('payroll-configurations')
@AdminOnly()
export class PayrollConfigurationsController {
  constructor(private readonly service: PayrollConfigurationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payroll configuration' })
  @ApiCreatedResponse({ description: 'Payroll configuration created' })
  @ApiBadRequestResponse({ description: 'Invalid payroll configuration payload' })
  @ApiConflictResponse({ description: 'Configuration code already exists' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Body() dto: CreatePayrollConfigurationDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'List payroll configurations' })
  @ApiResponse({ status: 200, description: 'Payroll configurations returned' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll(@Query() query: PayrollConfigurationListQueryDto) {
    return this.service.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payroll configuration by id' })
  @ApiResponse({ status: 200, description: 'Payroll configuration returned' })
  @ApiNotFoundResponse({ description: 'Payroll configuration not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate a payroll configuration' })
  @ApiResponse({ status: 200, description: 'Payroll configuration updated' })
  @ApiBadRequestResponse({ description: 'Invalid payroll configuration payload' })
  @ApiConflictResponse({ description: 'Configuration has periods or code already exists' })
  @ApiNotFoundResponse({ description: 'Payroll configuration not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdatePayrollConfigurationDto) {
    return this.service.update(id, dto)
  }
}
