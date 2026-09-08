import { ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

export class RetryPayslipUploadBatchDto {
  @ApiPropertyOptional({ type: [String], description: 'Specific failed item ids to retry' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @MaxLength(500, { each: true })
  @IsString({ each: true })
  itemIds?: string[]
}
