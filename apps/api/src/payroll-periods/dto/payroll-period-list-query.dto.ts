import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { PayrollPeriodStatus } from '@payroll/contracts'

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

export class PayrollPeriodListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @ApiPropertyOptional({ description: 'Payroll configuration id' })
  @IsOptional()
  @IsString()
  payrollConfigurationId?: string

  @ApiPropertyOptional({ enum: Object.values(PayrollPeriodStatus) })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Minimum period start date' })
  @IsOptional()
  @IsString()
  @Matches(dateOnlyPattern, { message: 'from must use YYYY-MM-DD' })
  from?: string

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Maximum period end date' })
  @IsOptional()
  @IsString()
  @Matches(dateOnlyPattern, { message: 'to must use YYYY-MM-DD' })
  to?: string
}
