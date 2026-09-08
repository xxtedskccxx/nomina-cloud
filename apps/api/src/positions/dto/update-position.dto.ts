import { PartialType } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'
import { CreatePositionDto } from './create-position.dto.js'

export class UpdatePositionDto extends PartialType(CreatePositionDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
