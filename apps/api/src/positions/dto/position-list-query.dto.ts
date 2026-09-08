import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class PositionListQueryDto {
  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }

    return value
  })
  @IsBoolean()
  isActive?: boolean
}
