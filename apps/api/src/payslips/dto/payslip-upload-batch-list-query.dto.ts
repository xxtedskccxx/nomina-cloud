import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PayslipUploadBatchStatus } from '@payroll/contracts'

export class PayslipUploadBatchListQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodId?: string

  @ApiPropertyOptional({ enum: Object.values(PayslipUploadBatchStatus) })
  @IsOptional()
  @IsEnum(PayslipUploadBatchStatus)
  status?: PayslipUploadBatchStatus
}
