import { EmploymentRecordStatus, EmploymentType } from '@payroll/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsEnum, IsOptional } from 'class-validator'

export class CreateEmploymentDto {
  @ApiProperty({ enum: Object.values(EmploymentType), example: EmploymentType.FULL_TIME })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType

  @ApiProperty({ example: '2026-01-01', description: 'Calendar date in YYYY-MM-DD format' })
  @IsDateString()
  startDate!: string

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null

  @ApiPropertyOptional({ enum: Object.values(EmploymentRecordStatus), default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(EmploymentRecordStatus)
  status?: EmploymentRecordStatus
}
