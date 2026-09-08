import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { EmploymentStatus } from '@payroll/contracts'

const codePattern = /^[a-z0-9][a-z0-9_-]*$/i
const documentPattern = /^[a-z0-9][a-z0-9./_-]*$/i
const phonePattern = /^[0-9+() .-]+$/

export class CreateEmployeeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(codePattern)
  employeeCode!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredName?: string | null

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(phonePattern)
  phone?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(codePattern)
  documentType?: string | null

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(documentPattern)
  documentNumber?: string | null

  @IsDateString()
  hireDate!: string

  @IsOptional()
  @IsDateString()
  terminationDate?: string | null

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus

  @IsOptional()
  @IsString()
  @MinLength(1)
  departmentId?: string | null

  @IsOptional()
  @IsString()
  @MinLength(1)
  positionId?: string | null

  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string | null
}
