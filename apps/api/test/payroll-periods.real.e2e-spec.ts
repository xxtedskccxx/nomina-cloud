import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { jest } from '@jest/globals'
import request from 'supertest'
import { prisma } from '@payroll/database'
import { AppModule } from '../src/app.module.js'
import { auth } from '../src/auth/auth.js'

jest.setTimeout(30_000)

function testSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
}

describe('Payroll configuration and periods against PostgreSQL', () => {
  let app: INestApplication
  const suffix = testSuffix()
  const configurationCode = `E2E-PAY-${suffix}`
  const inactiveConfigurationCode = `E2E-INACTIVE-${suffix}`
  const employeeCodes = [
    `E2E-PAY-EMP-${suffix}`,
    `E2E-END-EMP-${suffix}`,
    `E2E-FUT-EMP-${suffix}`,
    `E2E-CHANGE-EMP-${suffix}`,
  ]
  const periodCodes = [`E2E-P1-${suffix}`, `E2E-P2-${suffix}`, `E2E-EMPTY-${suffix}`]
  let adminAgent: request.SuperTest<request.Test>
  let employeeAgent: request.SuperTest<request.Test>
  let adminUserId = ''
  let employeeUserId = ''
  let configurationId = ''
  let inactiveConfigurationId = ''
  let periodId = ''
  let emptyPeriodId = ''
  const employeeIds: string[] = []
  const employmentIds: string[] = []
  const compensationIds: string[] = []

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication({ bodyParser: false })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    await app.init()

    const adminIdentity = {
      email: `payroll.admin.${suffix.toLowerCase()}@example.test`,
      username: `payroll_admin_${suffix.toLowerCase()}`,
      password: `Admin-${randomUUID()}-Aa1!`,
    }
    const employeeIdentity = {
      email: `payroll.employee.${suffix.toLowerCase()}@example.test`,
      username: `payroll_employee_${suffix.toLowerCase()}`,
      password: `Employee-${randomUUID()}-Aa1!`,
    }

    const [admin, employee] = await Promise.all([
      auth.api.createUser({
        body: {
          email: adminIdentity.email,
          name: 'E2E Payroll Admin',
          password: adminIdentity.password,
          role: 'ADMIN',
          data: { username: adminIdentity.username },
        },
      }),
      auth.api.createUser({
        body: {
          email: employeeIdentity.email,
          name: 'E2E Payroll Employee',
          password: employeeIdentity.password,
          role: 'EMPLOYEE',
          data: { username: employeeIdentity.username },
        },
      }),
    ])

    adminUserId = admin.user.id
    employeeUserId = employee.user.id
    adminAgent = request.agent(app.getHttpServer())
    employeeAgent = request.agent(app.getHttpServer())
    await adminAgent.post('/api/auth/sign-in/username').send({
      username: adminIdentity.username,
      password: adminIdentity.password,
    })
    await employeeAgent.post('/api/auth/sign-in/username').send({
      username: employeeIdentity.username,
      password: employeeIdentity.password,
    })
  })

  afterAll(async () => {
    if (periodId || emptyPeriodId) {
      await prisma.payrollParticipant.deleteMany({
        where: { payrollPeriodId: { in: [periodId, emptyPeriodId].filter(Boolean) } },
      })
    }
    await prisma.payrollPeriod.deleteMany({ where: { code: { in: periodCodes } } })
    await prisma.payrollConfiguration.deleteMany({
      where: { code: { in: [configurationCode, inactiveConfigurationCode] } },
    })
    await prisma.compensation.deleteMany({ where: { id: { in: compensationIds } } })
    await prisma.employment.deleteMany({ where: { id: { in: employmentIds } } })
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } })
    await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.account.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, employeeUserId] } } })
    await app.close()
  })

  it('creates configurations, validates period boundaries and respects inactive configurations', async () => {
    const configurationResponse = await adminAgent.post('/api/payroll-configurations').send({
      code: configurationCode.toLowerCase(),
      name: 'E2E regular payroll',
      currency: 'dop',
      payFrequency: 'MONTHLY',
    })
    expect(configurationResponse.status).toBe(201)
    expect(configurationResponse.body.data).toMatchObject({
      code: configurationCode,
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      isActive: true,
    })
    configurationId = configurationResponse.body.data.id

    const duplicateResponse = await adminAgent.post('/api/payroll-configurations').send({
      code: configurationCode,
      name: 'Duplicate',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
    })
    expect(duplicateResponse.status).toBe(409)
    expect(duplicateResponse.body.code).toBe('PAYROLL_CONFIGURATION_CODE_ALREADY_EXISTS')

    const inactiveResponse = await adminAgent.post('/api/payroll-configurations').send({
      code: inactiveConfigurationCode,
      name: 'E2E inactive payroll',
      currency: 'DOP',
      payFrequency: 'BIWEEKLY',
      isActive: false,
    })
    expect(inactiveResponse.status).toBe(201)
    inactiveConfigurationId = inactiveResponse.body.data.id

    const inactivePeriodResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: inactiveConfigurationId,
      code: periodCodes[0],
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-16',
    })
    expect(inactivePeriodResponse.status).toBe(409)
    expect(inactivePeriodResponse.body.code).toBe('PAYROLL_CONFIGURATION_INACTIVE')

    const invalidRangeResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[0],
      startDate: '2026-09-15',
      endDate: '2026-09-01',
      paymentDate: '2026-09-02',
    })
    expect(invalidRangeResponse.status).toBe(400)
    expect(invalidRangeResponse.body.code).toBe('INVALID_PAYROLL_PERIOD_DATES')

    const invalidPaymentDateResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[0],
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-14',
    })
    expect(invalidPaymentDateResponse.status).toBe(400)
    expect(invalidPaymentDateResponse.body.code).toBe('INVALID_PAYROLL_PERIOD_DATES')

    const periodResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[0],
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-16',
    })
    expect(periodResponse.status).toBe(201)
    expect(periodResponse.body.data).toMatchObject({
      code: periodCodes[0],
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-16',
      status: 'DRAFT',
    })
    periodId = periodResponse.body.data.id

    const overlapResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[1],
      startDate: '2026-09-15',
      endDate: '2026-09-30',
      paymentDate: '2026-10-01',
    })
    expect(overlapResponse.status).toBe(409)
    expect(overlapResponse.body.code).toBe('PAYROLL_PERIOD_OVERLAP')

    const adjacentResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[1],
      startDate: '2026-09-16',
      endDate: '2026-09-30',
      paymentDate: '2026-10-01',
    })
    expect(adjacentResponse.status).toBe(201)

    const structuralUpdateResponse = await adminAgent
      .patch(`/api/payroll-configurations/${configurationId}`)
      .send({ currency: 'USD' })
    expect(structuralUpdateResponse.status).toBe(409)
    expect(structuralUpdateResponse.body.code).toBe('PAYROLL_CONFIGURATION_HAS_PERIODS')
  })

  it('refreshes eligible participants idempotently, detects compensation coverage and serializes pagination', async () => {
    const createEmployee = async (index: number, userId?: string) => {
      const response = await adminAgent.post('/api/employees').send({
        employeeCode: employeeCodes[index],
        firstName: `Payroll${index}`,
        lastName: `Employee${index}`,
        hireDate: '2025-01-01',
        ...(userId ? { userId } : {}),
      })
      expect(response.status).toBe(201)
      const id = response.body.data.id as string
      employeeIds.push(id)
      return id
    }
    const createEmployment = async (employeeId: string, body: Record<string, string>) => {
      const response = await adminAgent.post(`/api/employees/${employeeId}/employments`).send(body)
      expect(response.status).toBe(201)
      const id = response.body.data.id as string
      employmentIds.push(id)
      return id
    }
    const createCompensation = async (
      employmentId: string,
      effectiveFrom: string,
      amount: string,
    ) => {
      const response = await adminAgent
        .post(`/api/employments/${employmentId}/compensations`)
        .send({ amount, currency: 'DOP', payFrequency: 'MONTHLY', effectiveFrom })
      expect(response.status).toBe(201)
      compensationIds.push(response.body.data.id as string)
      return response.body.data.id as string
    }

    const mainEmployeeId = await createEmployee(0, employeeUserId)
    const endedEmployeeId = await createEmployee(1)
    const futureEmployeeId = await createEmployee(2)
    const changedEmployeeId = await createEmployee(3)
    const mainEmploymentId = await createEmployment(mainEmployeeId, {
      employmentType: 'FULL_TIME',
      startDate: '2025-01-01',
    })
    const endedEmploymentId = await createEmployment(endedEmployeeId, {
      employmentType: 'TEMPORARY',
      startDate: '2026-01-01',
      endDate: '2026-09-10',
      status: 'ENDED',
    })
    await createEmployment(futureEmployeeId, {
      employmentType: 'FULL_TIME',
      startDate: '2026-10-01',
    })
    const changedEmploymentId = await createEmployment(changedEmployeeId, {
      employmentType: 'FULL_TIME',
      startDate: '2026-01-01',
    })
    const mainCompensationId = await createCompensation(mainEmploymentId, '2025-01-01', '50000.00')
    await createCompensation(changedEmploymentId, '2026-01-01', '40000.00')
    await createCompensation(changedEmploymentId, '2026-09-08', '45000.00')

    const refreshResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(refreshResponse.status).toBe(200)
    expect(refreshResponse.body.count).toBe(4)
    expect(refreshResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: mainEmployeeId,
          employmentId: mainEmploymentId,
          compensationId: mainCompensationId,
          compensationCoverage: 'SINGLE',
        }),
        expect.objectContaining({
          employeeId: endedEmployeeId,
          employmentId: endedEmploymentId,
          compensationCoverage: 'NONE',
        }),
        expect.objectContaining({
          employeeId: changedEmployeeId,
          employmentId: changedEmploymentId,
          compensationId: null,
          compensationCoverage: 'MULTIPLE',
        }),
      ]),
    )
    expect(refreshResponse.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ employeeId: futureEmployeeId })]),
    )

    const boundaryCompensationId = await createCompensation(
      mainEmploymentId,
      '2026-09-01',
      '51000.00',
    )
    const boundaryRefreshResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(boundaryRefreshResponse.status).toBe(200)
    expect(boundaryRefreshResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeId: mainEmployeeId,
          compensationId: boundaryCompensationId,
          compensationCoverage: 'SINGLE',
        }),
      ]),
    )

    const secondRefreshResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(secondRefreshResponse.status).toBe(200)
    expect(secondRefreshResponse.body.count).toBe(4)

    const [concurrentFirst, concurrentSecond] = await Promise.all([
      adminAgent.post(`/api/payroll-periods/${periodId}/participants/refresh`),
      adminAgent.post(`/api/payroll-periods/${periodId}/participants/refresh`),
    ])
    expect(concurrentFirst.status).toBe(200)
    expect(concurrentSecond.status).toBe(200)

    const participantsResponse = await adminAgent
      .get(`/api/payroll-periods/${periodId}/participants`)
      .query({ page: 1, pageSize: 2 })
    expect(participantsResponse.status).toBe(200)
    expect(participantsResponse.body.pagination).toMatchObject({ page: 1, pageSize: 2, total: 4 })
    expect(participantsResponse.body.data).toHaveLength(2)

    const duplicateParticipant = await prisma.payrollParticipant
      .create({
        data: {
          payrollPeriodId: periodId,
          employeeId: mainEmployeeId,
          employmentId: mainEmploymentId,
          compensationId: boundaryCompensationId,
          compensationCoverage: 'SINGLE',
        },
      })
      .catch((error: unknown) => error)
    expect(duplicateParticipant).toMatchObject({ code: 'P2002' })

    const deleteReferencedEmployee = await prisma.employee
      .delete({ where: { id: mainEmployeeId } })
      .catch((error: unknown) => error)
    expect(deleteReferencedEmployee).toMatchObject({ code: 'P2003' })
  })

  it('enforces draft/open/locked/reopen lifecycle and authorization', async () => {
    const openResponse = await adminAgent.post(`/api/payroll-periods/${periodId}/open`)
    expect(openResponse.status).toBe(200)
    expect(openResponse.body.data).toMatchObject({ status: 'OPEN', openedByUserId: adminUserId })

    const employeeListResponse = await employeeAgent.get('/api/payroll-configurations')
    expect(employeeListResponse.status).toBe(403)
    const employeePeriodResponse = await employeeAgent.get(`/api/payroll-periods/${periodId}`)
    expect(employeePeriodResponse.status).toBe(403)
    const employeeLifecycleResponse = await employeeAgent.post(
      `/api/payroll-periods/${periodId}/lock`,
    )
    expect(employeeLifecycleResponse.status).toBe(403)
    const anonymousResponse = await request(app.getHttpServer()).get('/api/payroll-configurations')
    expect(anonymousResponse.status).toBe(401)

    const concurrentRefresh = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(concurrentRefresh.status).toBe(200)

    const lockResponse = await adminAgent.post(`/api/payroll-periods/${periodId}/lock`)
    expect(lockResponse.status).toBe(200)
    expect(lockResponse.body.data).toMatchObject({ status: 'LOCKED', lockedByUserId: adminUserId })

    const lockedUpdateResponse = await adminAgent
      .patch(`/api/payroll-periods/${periodId}`)
      .send({ paymentDate: '2026-09-17' })
    expect(lockedUpdateResponse.status).toBe(409)
    expect(lockedUpdateResponse.body.code).toBe('PAYROLL_PERIOD_LOCKED')

    const lockedRefreshResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(lockedRefreshResponse.status).toBe(409)
    expect(lockedRefreshResponse.body.code).toBe('PAYROLL_PERIOD_REFRESH_LOCKED')

    const invalidOpenResponse = await adminAgent.post(`/api/payroll-periods/${periodId}/open`)
    expect(invalidOpenResponse.status).toBe(409)
    expect(invalidOpenResponse.body.code).toBe('INVALID_PAYROLL_PERIOD_TRANSITION')

    const reopenResponse = await adminAgent.post(`/api/payroll-periods/${periodId}/reopen`)
    expect(reopenResponse.status).toBe(200)
    expect(reopenResponse.body.data).toMatchObject({
      status: 'OPEN',
      reopenedByUserId: adminUserId,
    })
  })

  it('refuses to lock an open period without participants', async () => {
    const response = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCodes[2],
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      paymentDate: '2026-10-15',
    })
    expect(response.status).toBe(201)
    emptyPeriodId = response.body.data.id

    const openResponse = await adminAgent.post(`/api/payroll-periods/${emptyPeriodId}/open`)
    expect(openResponse.status).toBe(200)
    const lockResponse = await adminAgent.post(`/api/payroll-periods/${emptyPeriodId}/lock`)
    expect(lockResponse.status).toBe(409)
    expect(lockResponse.body.code).toBe('PAYROLL_PERIOD_HAS_NO_PARTICIPANTS')
  })
})
