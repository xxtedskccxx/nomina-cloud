import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { PayrollConfigurationsController } from './payroll-configurations.controller.js'
import { PayrollConfigurationsService } from './payroll-configurations.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [PayrollConfigurationsController],
  providers: [PayrollConfigurationsService],
  exports: [PayrollConfigurationsService],
})
export class PayrollConfigurationsModule {}
