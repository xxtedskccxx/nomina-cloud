import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

export interface PayslipPublishedEvent {
  type: 'PayslipPublished'
  payslipId: string
  employeeId: string
  payrollPeriodId: string
  publishedAt: string
}

@Injectable()
export class NotificationService {
  constructor(private readonly logger: PinoLogger) {}

  async publishPayslipPublished(event: PayslipPublishedEvent): Promise<void> {
    this.logger.info(
      {
        eventType: event.type,
        payslipId: event.payslipId,
        employeeId: event.employeeId,
        payrollPeriodId: event.payrollPeriodId,
        publishedAt: event.publishedAt,
      },
      'PayslipPublished event emitted',
    )
  }
}
