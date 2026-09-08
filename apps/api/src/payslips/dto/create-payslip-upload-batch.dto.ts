import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class CreatePayslipUploadBatchDto {
  @ApiProperty({ description: 'Payroll period that receives this upload batch' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  payrollPeriodId!: string
}
