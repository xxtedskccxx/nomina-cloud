import { PayFrequency } from '@payroll/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

const decimalAmountPattern = /^\d{1,16}(?:\.\d{1,2})?$/
const currencyPattern = /^[A-Za-z]{3}$/

export class CreateCompensationDto {
  @ApiProperty({ example: '60000.00', type: String, description: 'Decimal money amount' })
  @IsString()
  @Matches(decimalAmountPattern, {
    message: 'amount must be a positive decimal with up to two fractional digits',
  })
  @MaxLength(19)
  amount!: string

  @ApiProperty({ example: 'DOP', description: 'ISO 4217 three-letter code' })
  @IsString()
  @Matches(currencyPattern, { message: 'currency must be an ISO 4217 three-letter code' })
  currency!: string

  @ApiProperty({ enum: Object.values(PayFrequency), example: PayFrequency.MONTHLY })
  @IsEnum(PayFrequency)
  payFrequency!: PayFrequency

  @ApiProperty({ example: '2026-07-01', description: 'Inclusive calendar date in YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveFrom must use YYYY-MM-DD' })
  effectiveFrom!: string

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveTo must use YYYY-MM-DD' })
  effectiveTo?: string | null
}
