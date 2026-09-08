/* global process */

import { UserRole } from '@payroll/contracts'
import { prisma } from '@payroll/database'
import { auth } from '../dist/auth/auth.js'
import { ensureDevelopmentUser } from '../dist/auth/dev-seed.js'

function requireDevelopmentValue(name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required for the development seed`)
  }

  return value
}

function readIdentity(prefix, role) {
  return {
    email: requireDevelopmentValue(`SEED_${prefix}_EMAIL`),
    name: requireDevelopmentValue(`SEED_${prefix}_NAME`),
    password: requireDevelopmentValue(`SEED_${prefix}_PASSWORD`),
    username: requireDevelopmentValue(`SEED_${prefix}_USERNAME`),
    role,
  }
}

async function ensureDevelopmentDomain(portalUserId) {
  await prisma.$transaction(async (transaction) => {
    const itDepartment = await transaction.department.upsert({
      where: { code: 'IT' },
      create: {
        code: 'IT',
        name: 'Information Technology',
        description: 'Synthetic development department',
      },
      update: {
        name: 'Information Technology',
        description: 'Synthetic development department',
        isActive: true,
      },
    })
    const hrDepartment = await transaction.department.upsert({
      where: { code: 'HR' },
      create: {
        code: 'HR',
        name: 'Human Resources',
        description: 'Synthetic development department',
      },
      update: {
        name: 'Human Resources',
        description: 'Synthetic development department',
        isActive: true,
      },
    })
    const developerPosition = await transaction.position.upsert({
      where: { code: 'SOFTWARE_DEVELOPER' },
      create: {
        code: 'SOFTWARE_DEVELOPER',
        name: 'Software Developer',
        description: 'Synthetic development position',
        department: { connect: { id: itDepartment.id } },
      },
      update: {
        name: 'Software Developer',
        description: 'Synthetic development position',
        department: { connect: { id: itDepartment.id } },
        isActive: true,
      },
    })
    await transaction.position.upsert({
      where: { code: 'HR_SPECIALIST' },
      create: {
        code: 'HR_SPECIALIST',
        name: 'HR Specialist',
        description: 'Synthetic development position',
        department: { connect: { id: hrDepartment.id } },
      },
      update: {
        name: 'HR Specialist',
        description: 'Synthetic development position',
        department: { connect: { id: hrDepartment.id } },
        isActive: true,
      },
    })

    const developmentEmployee = await transaction.employee.upsert({
      where: { employeeCode: 'DEV-EMP-00001' },
      create: {
        employeeCode: 'DEV-EMP-00001',
        firstName: 'Development',
        lastName: 'Employee',
        email: 'development.employee@example.test',
        hireDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        department: { connect: { id: itDepartment.id } },
        position: { connect: { id: developerPosition.id } },
        ...(portalUserId ? { user: { connect: { id: portalUserId } } } : {}),
      },
      update: {
        firstName: 'Development',
        lastName: 'Employee',
        email: 'development.employee@example.test',
        hireDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        department: { connect: { id: itDepartment.id } },
        position: { connect: { id: developerPosition.id } },
        ...(portalUserId ? { user: { connect: { id: portalUserId } } } : {}),
      },
    })

    const developmentEmployment = await transaction.employment.findFirst({
      where: { employeeId: developmentEmployee.id, status: 'ACTIVE' },
      select: { id: true },
    })
    const employment = developmentEmployment
      ? await transaction.employment.update({
          where: { id: developmentEmployment.id },
          data: {
            employmentType: 'FULL_TIME',
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: null,
            status: 'ACTIVE',
          },
          select: { id: true },
        })
      : await transaction.employment.create({
          data: {
            employeeId: developmentEmployee.id,
            employmentType: 'FULL_TIME',
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            status: 'ACTIVE',
          },
          select: { id: true },
        })

    const existingCompensation = await transaction.compensation.findFirst({
      where: {
        employmentId: employment.id,
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    })
    if (existingCompensation) {
      await transaction.compensation.update({
        where: { id: existingCompensation.id },
        data: {
          amount: '60000.00',
          currency: 'DOP',
          payFrequency: 'MONTHLY',
          effectiveTo: null,
        },
      })
    } else {
      await transaction.compensation.create({
        data: {
          employmentId: employment.id,
          amount: '60000.00',
          currency: 'DOP',
          payFrequency: 'MONTHLY',
          effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
        },
      })
    }

    const existingRegularMonthlyConfiguration = await transaction.payrollConfiguration.findUnique({
      where: { code: 'REGULAR_MONTHLY' },
      select: { id: true },
    })
    const regularMonthlyConfiguration = existingRegularMonthlyConfiguration
      ? await transaction.payrollConfiguration.update({
          where: { id: existingRegularMonthlyConfiguration.id },
          data: {
            name: 'Regular monthly payroll',
          },
        })
      : await transaction.payrollConfiguration.create({
          data: {
            code: 'REGULAR_MONTHLY',
            name: 'Regular monthly payroll',
            currency: 'DOP',
            payFrequency: 'MONTHLY',
            isActive: true,
          },
        })

    const developmentPeriod = await transaction.payrollPeriod.findFirst({
      where: {
        payrollConfigurationId: regularMonthlyConfiguration.id,
        code: 'DEV-2026-09',
      },
      select: { id: true },
    })
    if (!developmentPeriod) {
      await transaction.payrollPeriod.create({
        data: {
          payrollConfigurationId: regularMonthlyConfiguration.id,
          code: 'DEV-2026-09',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          paymentDate: new Date('2026-10-01T00:00:00.000Z'),
        },
      })
    }
  })
}

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

async function main() {
  if ((process.env.NODE_ENV ?? 'development') !== 'development') {
    throw new Error('The development seed can only run with NODE_ENV=development')
  }

  const admin = await ensureDevelopmentUser(
    { database, authApi },
    readIdentity('ADMIN', UserRole.ADMIN),
  )
  process.stdout.write(`Development seed ensured ADMIN ${admin.email}\n`)

  if (process.env.SEED_EMPLOYEE_ENABLED?.toLowerCase() === 'true') {
    const employee = await ensureDevelopmentUser(
      { database, authApi },
      readIdentity('EMPLOYEE', UserRole.EMPLOYEE),
    )
    process.stdout.write(`Development seed ensured EMPLOYEE ${employee.email}\n`)
    if (process.env.SEED_DOMAIN_ENABLED?.toLowerCase() !== 'false') {
      await ensureDevelopmentDomain(employee.id)
      process.stdout.write('Development seed ensured domain demo data\n')
    }
  } else if (process.env.SEED_DOMAIN_ENABLED?.toLowerCase() !== 'false') {
    await ensureDevelopmentDomain()
    process.stdout.write('Development seed ensured domain demo data without portal link\n')
  }
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown seed error'
  process.stderr.write(`Development seed failed: ${message}\n`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
