import { ApiProperty } from '@nestjs/swagger'
import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
const codePattern = /^[a-z0-9][a-z0-9_-]*$/i

export class CreatePayrollPeriodDto {
  @ApiProperty({ example: 'config_cuid' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  payrollConfigurationId!: string

  @ApiProperty({ example: '2026-09-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(codePattern)
  code!: string

  @ApiProperty({ example: '2026-09-01', description: 'Calendar date in YYYY-MM-DD' })
  @IsString()
  @Matches(dateOnlyPattern, { message: 'startDate must use YYYY-MM-DD' })
  startDate!: string

  @ApiProperty({ example: '2026-09-15', description: 'Calendar date in YYYY-MM-DD' })
  @IsString()
  @Matches(dateOnlyPattern, { message: 'endDate must use YYYY-MM-DD' })
  endDate!: string

  @ApiProperty({ example: '2026-09-16', description: 'Calendar date in YYYY-MM-DD' })
  @IsString()
  @Matches(dateOnlyPattern, { message: 'paymentDate must use YYYY-MM-DD' })
  paymentDate!: string
}
