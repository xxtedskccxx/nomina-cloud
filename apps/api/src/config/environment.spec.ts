import { parseEnvironment } from '@payroll/config'

const baseEnvironment = {
  DATABASE_URL: 'postgresql://payroll:1234@127.0.0.1:5433/payroll?schema=public',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  BETTER_AUTH_URL: 'https://api.example.test',
  WEB_URL: 'https://web.example.test',
}

describe('production environment validation', () => {
  it('requires an explicit storage driver in production', () => {
    expect(() => parseEnvironment({ ...baseEnvironment, NODE_ENV: 'production' })).toThrow(
      'PAYSLIP_STORAGE_DRIVER is required in production',
    )
  })

  it('allows local storage without S3 credentials outside production', () => {
    const environment = parseEnvironment({
      ...baseEnvironment,
      NODE_ENV: 'development',
      PAYSLIP_STORAGE_DRIVER: 'local',
    })

    expect(environment.PAYSLIP_STORAGE_DRIVER).toBe('local')
    expect(environment.S3_BUCKET).toBeUndefined()
  })

  it('requires every S3 setting when the S3 driver is selected', () => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        PAYSLIP_STORAGE_DRIVER: 's3',
        S3_REGION: 'us-east-1',
      }),
    ).toThrow(
      'S3 storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    )
  })

  it('accepts a complete HTTPS production configuration', () => {
    const environment = parseEnvironment({
      ...baseEnvironment,
      NODE_ENV: 'production',
      PAYSLIP_STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://s3.example.test',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'private-payslips',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
    })

    expect(environment.PAYSLIP_STORAGE_DRIVER).toBe('s3')
  })

  it('rejects insecure production public URLs', () => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        PAYSLIP_STORAGE_DRIVER: 'local',
        WEB_URL: 'http://web.example.test',
      }),
    ).toThrow('WEB_URL must use HTTPS in production')
  })
})
