export { prisma } from './prisma'
export type { DatabaseClient } from './prisma'
export { Prisma } from './generated/prisma/client'

export const DATABASE_CLIENT = Symbol.for('@payroll/database/client')
