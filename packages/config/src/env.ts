import { z } from 'zod'

const booleanEnvironmentValue = z.preprocess((value: unknown) => {
  if (typeof value !== 'string') {
    return value
  }

  return value.toLowerCase() === 'true'
}, z.boolean())

const optionalEnvironmentValue = z.preprocess(
  (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

const optionalUrlEnvironmentValue = z.preprocess(
  (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
)

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must contain at least 32 characters'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  WEB_URL: z.string().url('WEB_URL must be a valid URL'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SWAGGER_ENABLED: booleanEnvironmentValue.default(true),
  PAYSLIP_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  PAYSLIP_STORAGE_ROOT: z.string().min(1).default('storage/payslips'),
  S3_ENDPOINT: optionalUrlEnvironmentValue,
  S3_REGION: optionalEnvironmentValue,
  S3_BUCKET: optionalEnvironmentValue,
  S3_ACCESS_KEY_ID: optionalEnvironmentValue,
  S3_SECRET_ACCESS_KEY: optionalEnvironmentValue,
  S3_FORCE_PATH_STYLE: booleanEnvironmentValue.default(false),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  PAYSLIP_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1_048_576)
    .max(50_000_000)
    .default(20_000_000),
  PAYSLIP_MAX_FILES_PER_UPLOAD: z.coerce.number().int().min(1).max(100).default(100),
  PAYSLIP_MAX_FILES_PER_BATCH: z.coerce.number().int().min(1).max(1_000).default(500),
})

export type Environment = z.infer<typeof environmentSchema>

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  const nodeEnvironment = input.NODE_ENV ?? 'development'
  if (nodeEnvironment === 'production' && !input.PAYSLIP_STORAGE_DRIVER?.trim()) {
    throw new Error('PAYSLIP_STORAGE_DRIVER is required in production')
  }

  const environment = environmentSchema.parse(input)
  if (environment.NODE_ENV === 'production') {
    for (const [name, value] of [
      ['BETTER_AUTH_URL', environment.BETTER_AUTH_URL],
      ['WEB_URL', environment.WEB_URL],
    ] as const) {
      if (!value.startsWith('https://')) {
        throw new Error(`${name} must use HTTPS in production`)
      }
    }
  }

  if (environment.PAYSLIP_STORAGE_DRIVER === 's3') {
    const requiredS3Settings = [
      ['S3_ENDPOINT', environment.S3_ENDPOINT],
      ['S3_REGION', environment.S3_REGION],
      ['S3_BUCKET', environment.S3_BUCKET],
      ['S3_ACCESS_KEY_ID', environment.S3_ACCESS_KEY_ID],
      ['S3_SECRET_ACCESS_KEY', environment.S3_SECRET_ACCESS_KEY],
    ] as const
    if (requiredS3Settings.some(([, value]) => !value)) {
      throw new Error(
        'S3 storage requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      )
    }
  }

  return environment
}
