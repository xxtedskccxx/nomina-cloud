import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta !== 'undefined' && import.meta.url
      ? fileURLToPath(new URL('.', import.meta.url))
      : process.cwd()

loadDotEnv({ path: resolve(currentDir, '../../.env'), quiet: true })
loadDotEnv({ path: resolve(process.cwd(), '.env'), quiet: true })
loadDotEnv({ path: resolve(process.cwd(), '../../.env'), quiet: true })

// Client generation does not open a database connection. The local-only
// fallback keeps `pnpm install` usable before `.env` is copied; migrations and
// runtime API startup still require DATABASE_URL through their own validation.
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://127.0.0.1:5433/payroll'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
})
