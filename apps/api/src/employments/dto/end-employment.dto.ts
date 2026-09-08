import { IsDateString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class EndEmploymentDto {
  @ApiProperty({ example: '2026-06-30', description: 'Inclusive calendar date in YYYY-MM-DD' })
  @IsDateString()
  endDate!: string
}
