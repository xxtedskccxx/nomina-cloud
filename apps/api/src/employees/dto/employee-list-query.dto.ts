import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { EmploymentStatus } from '@payroll/contracts'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20

export class EmployeeListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = DEFAULT_PAGE_SIZE

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  positionId?: string
}
