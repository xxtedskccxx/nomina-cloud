import { jest } from '@jest/globals'
import { LocalFileStorageService } from '../payslips/file-storage.service.js'
import { S3FileStorageService } from './s3-file-storage.service.js'
import { createFileStorage } from './storage.config.js'

describe('storage configuration', () => {
  it('creates local storage without reading S3 settings', () => {
    const get = jest.fn(
      (key: string) =>
        ({ PAYSLIP_STORAGE_DRIVER: 'local', PAYSLIP_STORAGE_ROOT: 'storage/test-payslips' })[
          key as 'PAYSLIP_STORAGE_DRIVER' | 'PAYSLIP_STORAGE_ROOT'
        ],
    )

    const storage = createFileStorage({ get } as never)

    expect(storage).toBeInstanceOf(LocalFileStorageService)
    expect(get).not.toHaveBeenCalledWith('S3_BUCKET')
  })

  it('fails fast when S3 settings are incomplete', () => {
    const get = jest.fn(
      (key: string) =>
        ({ PAYSLIP_STORAGE_DRIVER: 's3', S3_REGION: 'us-east-1' })[key as 'PAYSLIP_STORAGE_DRIVER'],
    )

    expect(() => createFileStorage({ get } as never)).toThrow(
      'S3 storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    )
  })

  it('creates S3 storage only after all settings are present', () => {
    const get = jest.fn(
      (key: string) =>
        (
          ({
            PAYSLIP_STORAGE_DRIVER: 's3',
            S3_ENDPOINT: 'https://s3.example.test',
            S3_REGION: 'us-east-1',
            S3_BUCKET: 'private-payslips',
            S3_ACCESS_KEY_ID: 'test-access-key',
            S3_SECRET_ACCESS_KEY: 'test-secret-key',
            S3_FORCE_PATH_STYLE: false,
          }) as Record<string, string | boolean>
        )[key],
    )

    const storage = createFileStorage({ get } as never)

    expect(storage).toBeInstanceOf(S3FileStorageService)
  })
})
