import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotEnv } from 'dotenv'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

const candidatePaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '../..', '.env'),
  resolve(__dirname, '.env'),
  resolve(__dirname, '..', '.env'),
  resolve(__dirname, '../..', '.env'),
  resolve(__dirname, '../../..', '.env'),
]

for (const candidate of candidatePaths) {
  if (existsSync(candidate)) {
    loadDotEnv({ path: candidate, quiet: true })
  }
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to initialize the database client. Copy .env.example to .env first.',
  )
}

const adapter = new PrismaPg({ connectionString: databaseUrl })

export const prisma = new PrismaClient({ adapter })

export type DatabaseClient = PrismaClient
