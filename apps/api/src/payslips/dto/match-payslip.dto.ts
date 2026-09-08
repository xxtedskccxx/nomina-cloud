import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length } from 'class-validator'

export class MatchPayslipDto {
  @ApiProperty({ description: 'Employee id selected during manual review' })
  @IsString()
  @Length(1, 64)
  employeeId!: string
}
