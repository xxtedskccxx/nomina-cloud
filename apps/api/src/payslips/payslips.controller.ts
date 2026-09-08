import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import type { Readable } from 'node:stream'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AdminOnly, Authenticated } from '../auth/authorization.decorator.js'
import { CurrentUserId } from '../auth/current-user.decorator.js'
import type { Environment } from '@payroll/config'
import type { Response } from 'express'
import { MatchPayslipDto } from './dto/match-payslip.dto.js'
import { PayslipListQueryDto } from './dto/payslip-list-query.dto.js'
import { CreatePayslipUploadBatchDto } from './dto/create-payslip-upload-batch.dto.js'
import { PayslipUploadBatchListQueryDto } from './dto/payslip-upload-batch-list-query.dto.js'
import { RetryPayslipUploadBatchDto } from './dto/retry-payslip-upload-batch.dto.js'
import type { UploadedPayslipFile } from './payslips.service.js'
import { PayslipsService } from './payslips.service.js'
import { PayslipUploadBatchesService } from './payslip-upload-batches.service.js'

@ApiTags('payslips')
@Controller()
export class PayslipsController {
  private readonly webUrl: string

  constructor(
    private readonly service: PayslipsService,
    private readonly batches: PayslipUploadBatchesService,
    configService: ConfigService<Environment>,
  ) {
    this.webUrl = configService.get('WEB_URL') ?? 'http://localhost:3000'
  }

  @Post('payslip-upload-batches')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a persistent payslip upload batch' })
  @ApiCreatedResponse({ description: 'Upload batch created' })
  @ApiBadRequestResponse({ description: 'Invalid payroll period' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  createBatch(@Body() dto: CreatePayslipUploadBatchDto, @CurrentUserId() actorUserId: string) {
    return this.batches.create(dto.payrollPeriodId, actorUserId)
  }

  @Get('payslip-upload-batches')
  @AdminOnly()
  @ApiOperation({ summary: 'List recent payslip upload batches' })
  @ApiResponse({ status: 200, description: 'Upload batch history returned' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findBatches(@Query() query: PayslipUploadBatchListQueryDto) {
    return this.batches.findAll(query)
  }

  @Get('payslip-upload-batches/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Resume a payslip upload batch with per-file results' })
  @ApiResponse({ status: 200, description: 'Upload batch detail returned' })
  @ApiNotFoundResponse({ description: 'Upload batch not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findBatch(@Param('id') id: string) {
    return this.batches.findOne(id)
  }

  @Post('payslip-upload-batches/:id/files')
  @AdminOnly()
  @UseInterceptors(FilesInterceptor('files', 100))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add PDFs to a persistent upload batch' })
  @ApiResponse({ status: 200, description: 'Per-file batch processing results returned' })
  @ApiBadRequestResponse({ description: 'Missing files or invalid batch size' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  addBatchFiles(
    @Param('id') id: string,
    @UploadedFiles() files: UploadedPayslipFile[],
    @CurrentUserId() actorUserId: string,
  ) {
    return this.batches.addFiles(id, files, actorUserId)
  }

  @Post('payslip-upload-batches/:id/retry')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed files from a persistent upload batch' })
  @ApiResponse({ status: 200, description: 'Batch retry results returned' })
  @ApiNotFoundResponse({ description: 'Upload batch not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  retryBatch(
    @Param('id') id: string,
    @Body() dto: RetryPayslipUploadBatchDto,
    @CurrentUserId() actorUserId: string,
  ) {
    return this.batches.retry(id, actorUserId, dto.itemIds)
  }

  @Post('payslip-upload-batches/:id/publish')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish ready payslips from a specific upload batch' })
  @ApiResponse({ status: 200, description: 'Batch publication summary returned' })
  @ApiNotFoundResponse({ description: 'Upload batch not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  publishBatch(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.batches.publish(id, actorUserId)
  }

  @Post('payroll-periods/:periodId/payslips/upload')
  @AdminOnly()
  @UseInterceptors(FilesInterceptor('files', 100))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Upload one or more PDF payslips into a payroll period' })
  @ApiCreatedResponse({ description: 'Upload summary returned per file' })
  @ApiBadRequestResponse({ description: 'Missing files or invalid upload batch' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  upload(
    @Param('periodId') periodId: string,
    @UploadedFiles() files: UploadedPayslipFile[],
    @CurrentUserId() actorUserId: string,
  ) {
    return this.service.upload(periodId, files, actorUserId)
  }

  @Get('payroll-periods/:periodId/payslips/missing')
  @AdminOnly()
  @ApiOperation({ summary: 'List participants without a current payslip' })
  @ApiResponse({ status: 200, description: 'Missing payslips returned' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findMissing(@Param('periodId') periodId: string, @Query() query: PayslipListQueryDto) {
    return this.service.findMissing(periodId, query)
  }

  @Get('payroll-periods/:periodId/payslips')
  @AdminOnly()
  @ApiOperation({ summary: 'List payslips and processing summary for a payroll period' })
  @ApiResponse({ status: 200, description: 'Payslips returned with summary and pagination' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findAll(@Param('periodId') periodId: string, @Query() query: PayslipListQueryDto) {
    return this.service.findAll(periodId, query)
  }

  @Get('payslips/:id/file')
  @AdminOnly()
  @ApiOperation({ summary: 'Stream a payslip PDF for an administrator' })
  @ApiResponse({ status: 200, description: 'PDF streamed' })
  @ApiNotFoundResponse({ description: 'Payslip or PDF not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  async getAdminFile(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.toPdfResponse(await this.service.getAdminFile(id), download === 'true', response)
  }

  @Get('payslips/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get payslip metadata for administration' })
  @ApiResponse({ status: 200, description: 'Payslip metadata returned' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch('payslips/:id/match')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a draft payslip to an employee during manual review' })
  @ApiResponse({ status: 200, description: 'Payslip matched' })
  @ApiBadRequestResponse({ description: 'Invalid employee selection' })
  @ApiNotFoundResponse({ description: 'Payslip or employee not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  match(
    @Param('id') id: string,
    @Body() dto: MatchPayslipDto,
    @CurrentUserId() actorUserId: string,
  ) {
    return this.service.match(id, dto, actorUserId)
  }

  @Post('payslips/:id/publish')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish one matched payslip to its employee' })
  @ApiResponse({ status: 200, description: 'Payslip published' })
  @ApiNotFoundResponse({ description: 'Payslip or file not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  publish(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.publish(id, actorUserId)
  }

  @Post('payroll-periods/:periodId/payslips/publish')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish all matched draft payslips in a period' })
  @ApiResponse({ status: 200, description: 'Bulk publication summary returned' })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  publishAll(@Param('periodId') periodId: string, @CurrentUserId() actorUserId: string) {
    return this.service.publishAll(periodId, actorUserId)
  }

  @Post('payslips/:id/replace')
  @AdminOnly()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Explicitly archive and replace an active payslip' })
  @ApiResponse({ status: 200, description: 'Replacement created as draft' })
  @ApiBadRequestResponse({ description: 'Invalid replacement PDF' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  replace(
    @Param('id') id: string,
    @UploadedFile() file: UploadedPayslipFile,
    @CurrentUserId() actorUserId: string,
  ) {
    return this.service.replace(id, file, actorUserId)
  }

  @Post('payslips/:id/archive')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a published payslip without deleting its PDF' })
  @ApiResponse({ status: 200, description: 'Payslip archived' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  archive(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.archive(id, actorUserId)
  }

  @Delete('payslips/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a draft payslip and its local file' })
  @ApiResponse({ status: 200, description: 'Draft payslip deleted' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  remove(@Param('id') id: string, @CurrentUserId() actorUserId: string) {
    return this.service.remove(id, actorUserId)
  }

  @Get('employees/me/payslips')
  @Authenticated()
  @ApiOperation({ summary: 'List published payslips for the authenticated employee' })
  @ApiResponse({ status: 200, description: 'Employee payslips returned' })
  @ApiNotFoundResponse({ description: 'Employee profile not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findMine(@CurrentUserId() userId: string, @Query() query: PayslipListQueryDto) {
    return this.service.findMine(userId, query)
  }

  @Get('employees/me/payslips/:id/file')
  @Authenticated()
  @ApiOperation({ summary: 'Stream the authenticated employee own published payslip PDF' })
  @ApiResponse({ status: 200, description: 'PDF streamed' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  async getMineFile(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.toPdfResponse(
      await this.service.getMineFile(userId, id),
      download === 'true',
      response,
    )
  }

  @Get('employees/me/payslips/:id')
  @Authenticated()
  @ApiOperation({ summary: 'Get a published payslip belonging to the authenticated employee' })
  @ApiResponse({ status: 200, description: 'Employee payslip metadata returned' })
  @ApiNotFoundResponse({ description: 'Payslip not found' })
  @ApiUnauthorizedResponse({ description: 'Better Auth session required' })
  findMineOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.findMineOne(userId, id)
  }

  private toPdfResponse(
    file: { stream: Readable; fileName: string; fileSize: number },
    download: boolean,
    response: Response,
  ): StreamableFile {
    const safeFileName = file.fileName.replace(/["\\\r\n]/g, '') || 'payslip.pdf'
    response.removeHeader('X-Frame-Options')
    response.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${this.webUrl}`)
    return new StreamableFile(file.stream, {
      type: 'application/pdf',
      length: file.fileSize,
      disposition: `${download ? 'attachment' : 'inline'}; filename="${safeFileName}"`,
    })
  }
}
