import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin as adminPlugin, username } from 'better-auth/plugins'
import { parseEnvironment } from '@payroll/config'
import { prisma } from '@payroll/database'
import { accessControl, adminRole, employeeRole } from './permissions.js'

const environment = parseEnvironment(process.env)

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: environment.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: [
    environment.WEB_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.100.9:3000',
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 4,
  },
  rateLimit: {
    enabled: environment.NODE_ENV !== 'test',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/*': { window: 60, max: 10 },
    },
  },
  plugins: [
    username(),
    adminPlugin({
      ac: accessControl,
      roles: {
        ADMIN: adminRole,
        EMPLOYEE: employeeRole,
      },
      defaultRole: 'EMPLOYEE',
    }),
  ],
  advanced: {
    database: {
      joins: true,
    },
    useSecureCookies: environment.NODE_ENV === 'production',
  },
})
