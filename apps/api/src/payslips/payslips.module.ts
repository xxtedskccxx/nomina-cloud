import { Module } from '@nestjs/common'
import { PrismaModule } from '../config/prisma.module.js'
import { PayslipsController } from './payslips.controller.js'
import { PayslipsService } from './payslips.service.js'
import { PayslipPublicationService } from './payslip-publication.service.js'
import { PayslipUploadBatchesService } from './payslip-upload-batches.service.js'
import { NotificationService } from '../notifications/notification.service.js'
import { StorageModule } from '../storage/storage.module.js'

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [PayslipsController],
  providers: [
    NotificationService,
    PayslipPublicationService,
    PayslipUploadBatchesService,
    PayslipsService,
  ],
  exports: [PayslipsService],
})
export class PayslipsModule {}
