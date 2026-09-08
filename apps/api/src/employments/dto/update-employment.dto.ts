import { PartialType } from '@nestjs/swagger'
import { CreateEmploymentDto } from './create-employment.dto.js'

export class UpdateEmploymentDto extends PartialType(CreateEmploymentDto) {}
