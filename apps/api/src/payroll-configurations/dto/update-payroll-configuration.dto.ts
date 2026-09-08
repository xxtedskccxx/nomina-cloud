import { PartialType } from '@nestjs/swagger'
import { CreatePayrollConfigurationDto } from './create-payroll-configuration.dto.js'

export class UpdatePayrollConfigurationDto extends PartialType(CreatePayrollConfigurationDto) {}
