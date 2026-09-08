import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { EmploymentsController } from './employments.controller.js'
import { EmploymentsService } from './employments.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [EmploymentsController],
  providers: [EmploymentsService],
  exports: [EmploymentsService],
})
export class EmploymentsModule {}
