import { OmitType, PartialType } from '@nestjs/swagger'
import { CreatePayrollPeriodDto } from './create-payroll-period.dto.js'

export class UpdatePayrollPeriodDto extends PartialType(
  OmitType(CreatePayrollPeriodDto, ['payrollConfigurationId'] as const),
) {}
