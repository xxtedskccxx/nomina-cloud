import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { EmployeesController } from './employees.controller.js'
import { EmployeesService } from './employees.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
