import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

function parseBoolean(value: unknown): unknown {
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return value
}

export class PayrollConfigurationListQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Filter by active state' })
  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  isActive?: boolean
}
