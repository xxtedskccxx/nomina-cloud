import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'

export class PayslipListQueryDto {
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

  @ApiPropertyOptional({ description: 'Employee code, first name or last name' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ enum: Object.values(PayslipStatus) })
  @IsOptional()
  @IsEnum(PayslipStatus)
  status?: PayslipStatus

  @ApiPropertyOptional({ enum: Object.values(PayslipMatchStatus) })
  @IsOptional()
  @IsEnum(PayslipMatchStatus)
  matchStatus?: PayslipMatchStatus
}
