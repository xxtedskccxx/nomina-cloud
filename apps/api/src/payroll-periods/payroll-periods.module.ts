import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { PayrollPeriodsController } from './payroll-periods.controller.js'
import { PayrollPeriodsService } from './payroll-periods.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [PayrollPeriodsController],
  providers: [PayrollPeriodsService],
  exports: [PayrollPeriodsService],
})
export class PayrollPeriodsModule {}
