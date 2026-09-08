import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { DepartmentsController } from './departments.controller.js'
import { DepartmentsService } from './departments.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
