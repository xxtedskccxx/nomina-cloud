import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import type { Environment } from '@payroll/config'
import { FILE_STORAGE } from '../payslips/file-storage.js'
import { createFileStorage } from './storage.config.js'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment>) => createFileStorage(configService),
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
