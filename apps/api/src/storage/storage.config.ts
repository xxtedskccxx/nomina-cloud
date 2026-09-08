import { resolve } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import type { ConfigService } from '@nestjs/config'
import type { Environment } from '@payroll/config'
import type { FileStorage } from '../payslips/file-storage.js'
import { LocalFileStorageService } from './local-file-storage.service.js'
import { S3FileStorageService } from './s3-file-storage.service.js'

export function createFileStorage(configService: ConfigService<Environment>): FileStorage {
  const driver = configService.get('PAYSLIP_STORAGE_DRIVER') ?? 'local'
  if (driver === 'local') {
    const root = configService.get('PAYSLIP_STORAGE_ROOT') ?? 'storage/payslips'
    return new LocalFileStorageService(resolve(process.cwd(), root))
  }
  if (driver !== 's3') {
    throw new Error(`Unsupported PAYSLIP_STORAGE_DRIVER: ${String(driver)}`)
  }

  const endpoint = configService.get('S3_ENDPOINT')
  const region = configService.get('S3_REGION')
  const bucket = configService.get('S3_BUCKET')
  const accessKeyId = configService.get('S3_ACCESS_KEY_ID')
  const secretAccessKey = configService.get('S3_SECRET_ACCESS_KEY')
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'S3 storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    )
  }

  return new S3FileStorageService(
    new S3Client({
      endpoint,
      region,
      forcePathStyle: configService.get('S3_FORCE_PATH_STYLE') ?? false,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  )
}
