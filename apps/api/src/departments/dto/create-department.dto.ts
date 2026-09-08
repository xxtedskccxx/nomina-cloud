import { IsOptional, IsString, MaxLength, Matches, MinLength } from 'class-validator'

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/i)
  code!: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string | null
}
