/* global process */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotEnv } from 'dotenv'

const currentDir = dirname(fileURLToPath(import.meta.url))
loadDotEnv({ path: resolve(currentDir, '../../../.env'), quiet: true })

console.log('[Production Startup] Checking database connection and running migrations...')
try {
  execSync('npx prisma migrate deploy --config packages/database/prisma.config.ts', {
    stdio: 'inherit',
    env: process.env,
  })
  console.log('[Production Startup] Database migrations up to date.')
} catch (error) {
  console.error('[Production Startup] Warning: migration step exited with error:', error.message)
}

if (process.env.SEED_ADMIN_ON_STARTUP?.toLowerCase() === 'true' || !process.env.SEED_ADMIN_ON_STARTUP) {
  try {
    console.log('[Production Startup] Ensuring initial admin account...')
    const { prisma } = await import('@payroll/database')
    const { auth } = await import('../dist/auth/auth.js')
    const { ensureDevelopmentUser } = await import('../dist/auth/dev-seed.js')
    const { UserRole } = await import('@payroll/contracts')

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@payroll.local'
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || '1234'
    const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin'
    const adminName = process.env.SEED_ADMIN_NAME || 'Administrador'

    const database = {
      findUserByEmail: (email) =>
        prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, username: true, role: true },
        }),
      updateUser: (id, data) =>
        prisma.user.update({
          where: { id },
          data,
          select: { id: true, email: true, name: true, username: true, role: true },
        }),
    }

    const authApi = {
      createUser: async (identity) => {
        const result = await auth.api.createUser({
          body: {
            email: identity.email,
            name: identity.name,
            password: identity.password,
            role: identity.role,
            data: {
              username: identity.username,
              displayUsername: identity.username,
            },
          },
        })
        return result.user
      },
    }

    await ensureDevelopmentUser(
      { database, authApi },
      {
        email: adminEmail,
        name: adminName,
        password: adminPassword,
        username: adminUsername,
        role: UserRole.ADMIN,
      },
    )
    console.log(`[Production Startup] Initial admin verified (${adminUsername}).`)
  } catch (error) {
    console.error('[Production Startup] Note: seed admin skipped or already ensured:', error.message)
  }
}

console.log('[Production Startup] Starting NestJS Application...')
await import('../dist/main.js')
