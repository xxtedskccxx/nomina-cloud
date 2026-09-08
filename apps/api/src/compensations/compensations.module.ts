import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { CompensationsController } from './compensations.controller.js'
import { CompensationsService } from './compensations.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [CompensationsController],
  providers: [CompensationsService],
  exports: [CompensationsService],
})
export class CompensationsModule {}
