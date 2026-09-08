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
import { AdminOnly } from '../auth/authorization.decorator.js'
import { CreatePositionDto } from './dto/create-position.dto.js'
import { PositionListQueryDto } from './dto/position-list-query.dto.js'
import { UpdatePositionDto } from './dto/update-position.dto.js'
import { PositionsService } from './positions.service.js'

@ApiTags('positions')
@Controller('positions')
@AdminOnly()
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a position' })
  @ApiCreatedResponse({ description: 'Position created' })
  @ApiBadRequestResponse({ description: 'Invalid position payload' })
  @ApiConflictResponse({ description: 'Position code already exists' })
  @ApiNotFoundResponse({ description: 'Department not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  create(@Body() dto: CreatePositionDto) {
    return this.positionsService.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'List positions' })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Positions returned in a data envelope' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll(@Query() query: PositionListQueryDto) {
    return this.positionsService.findAll(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a position by id' })
  @ApiResponse({ status: 200, description: 'Position returned' })
  @ApiNotFoundResponse({ description: 'Position not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.positionsService.findOne(id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate a position' })
  @ApiResponse({ status: 200, description: 'Position updated' })
  @ApiBadRequestResponse({ description: 'Invalid position payload' })
  @ApiConflictResponse({ description: 'Position code already exists' })
  @ApiNotFoundResponse({ description: 'Position or department not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.positionsService.update(id, dto)
  }
}
