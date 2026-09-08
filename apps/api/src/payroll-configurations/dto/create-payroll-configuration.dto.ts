import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PayFrequency } from '@payroll/contracts'
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

const codePattern = /^[a-z0-9][a-z0-9_-]*$/i
const currencyPattern = /^[A-Za-z]{3}$/

export class CreatePayrollConfigurationDto {
  @ApiProperty({ example: 'REGULAR_MONTHLY' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(codePattern)
  code!: string

  @ApiProperty({ example: 'Regular monthly payroll' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @ApiProperty({ example: 'DOP', description: 'ISO 4217 three-letter code' })
  @IsString()
  @Matches(currencyPattern, { message: 'currency must be an ISO 4217 three-letter code' })
  currency!: string

  @ApiProperty({ enum: Object.values(PayFrequency), example: PayFrequency.MONTHLY })
  @IsEnum(PayFrequency)
  payFrequency!: PayFrequency

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
