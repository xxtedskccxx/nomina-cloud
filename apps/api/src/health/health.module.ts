import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
