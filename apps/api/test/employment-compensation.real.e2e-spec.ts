import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { jest } from '@jest/globals'
import request, { type SuperAgentTest } from 'supertest'
import { prisma } from '@payroll/database'
import { AppModule } from '../src/app.module.js'
import { auth } from '../src/auth/auth.js'

jest.setTimeout(30_000)

describe('Employment and compensation against PostgreSQL', () => {
  let app: INestApplication
  let adminAgent: SuperAgentTest
  let employeeAgent: SuperAgentTest
  let employeeId = ''
  let employmentId = ''
  let activeEmploymentId = ''
  let compensationId = ''
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const adminIdentity = {
    email: `phase3.admin.${suffix}@example.test`,
    username: `phase3_admin_${suffix}`,
    password: `Phase3-${randomUUID()}-Aa1!`,
  }
  const employeeIdentity = {
    email: `phase3.employee.${suffix}@example.test`,
    username: `phase3_employee_${suffix}`,
    password: `Phase3-${randomUUID()}-Aa1!`,
  }

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

    const adminCreation = await auth.api.createUser({
      body: {
        email: adminIdentity.email,
        name: 'Phase 3 Admin',
        password: adminIdentity.password,
        role: 'ADMIN',
        data: { username: adminIdentity.username },
      },
    })
    const employeeCreation = await auth.api.createUser({
      body: {
        email: employeeIdentity.email,
        name: 'Phase 3 Employee',
        password: employeeIdentity.password,
        role: 'EMPLOYEE',
        data: { username: employeeIdentity.username },
      },
    })

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

    const employeeResponse = await adminAgent.post('/api/employees').send({
      employeeCode: `PH3-${suffix}`,
      firstName: 'Phase',
      lastName: 'Employee',
      hireDate: '2026-01-01',
      userId: employeeCreation.user.id,
    })
    expect(employeeResponse.status).toBe(201)
    employeeId = employeeResponse.body.data.id
    expect(adminCreation.user.id).toBeTruthy()
  })

  afterAll(async () => {
    if (employeeId) {
      const employments = await prisma.employment.findMany({
        where: { employeeId },
        select: { id: true },
      })
      const employmentIds = employments.map(({ id }) => id)
      if (employmentIds.length > 0) {
        await prisma.compensation.deleteMany({ where: { employmentId: { in: employmentIds } } })
        await prisma.employment.deleteMany({ where: { id: { in: employmentIds } } })
      }
      await prisma.employee.deleteMany({ where: { id: employeeId } })
    }

    const users = await prisma.user.findMany({
      where: { email: { in: [adminIdentity.email, employeeIdentity.email] } },
      select: { id: true },
    })
    const userIds = users.map(({ id }) => id)
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    }

    await app.close()
  })

  it('supports employment lifecycle, active uniqueness and self-service authorization', async () => {
    const createResponse = await adminAgent
      .post(`/api/employees/${employeeId}/employments`)
      .send({ employmentType: 'FULL_TIME', startDate: '2026-01-01' })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data).toMatchObject({
      employeeId,
      employmentType: 'FULL_TIME',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: null,
    })
    employmentId = createResponse.body.data.id

    const duplicateActiveResponse = await adminAgent
      .post(`/api/employees/${employeeId}/employments`)
      .send({ employmentType: 'PART_TIME', startDate: '2026-02-01' })
    expect(duplicateActiveResponse.status).toBe(409)
    expect(duplicateActiveResponse.body.code).toBe('EMPLOYMENT_ALREADY_ACTIVE')

    const invalidPeriodResponse = await adminAgent
      .post(`/api/employees/${employeeId}/employments`)
      .send({
        employmentType: 'FULL_TIME',
        startDate: '2026-06-01',
        endDate: '2026-05-31',
      })
    expect(invalidPeriodResponse.status).toBe(400)
    expect(invalidPeriodResponse.body.code).toBe('INVALID_EMPLOYMENT_PERIOD')

    const invalidEmployeeResponse = await adminAgent
      .post('/api/employees/missing-employee/employments')
      .send({ employmentType: 'FULL_TIME', startDate: '2026-01-01' })
    expect(invalidEmployeeResponse.status).toBe(404)
    expect(invalidEmployeeResponse.body.code).toBe('EMPLOYEE_NOT_FOUND')

    const ownResponse = await employeeAgent.get('/api/employees/me/employment')
    expect(ownResponse.status).toBe(200)
    expect(ownResponse.body.data).toMatchObject({ id: employmentId, employeeId })

    const employeeAdminResponse = await employeeAgent.get(
      `/api/employees/${employeeId}/employments`,
    )
    expect(employeeAdminResponse.status).toBe(403)
    const anonymousResponse = await request(app.getHttpServer()).get(
      `/api/employees/${employeeId}/employments`,
    )
    expect(anonymousResponse.status).toBe(401)

    const endResponse = await adminAgent.post(`/api/employments/${employmentId}/end`).send({
      endDate: '2026-06-30',
    })
    expect(endResponse.status).toBe(200)
    expect(endResponse.body.data).toMatchObject({ status: 'ENDED', endDate: '2026-06-30' })

    const secondEmploymentResponse = await adminAgent
      .post(`/api/employees/${employeeId}/employments`)
      .send({ employmentType: 'TEMPORARY', startDate: '2026-07-01' })
    expect(secondEmploymentResponse.status).toBe(201)
    activeEmploymentId = secondEmploymentResponse.body.data.id

    const listResponse = await adminAgent.get(`/api/employees/${employeeId}/employments`)
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data).toHaveLength(2)
  })

  it('stores Decimal compensation history, prevents overlap and exposes only own conditions', async () => {
    const createResponse = await adminAgent
      .post(`/api/employments/${activeEmploymentId}/compensations`)
      .send({
        amount: '50000.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-07-01',
      })
    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data).toMatchObject({
      amount: '50000.00',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    })
    compensationId = createResponse.body.data.id

    const persistedCompensation = await prisma.compensation.findUnique({
      where: { id: compensationId },
      select: { amount: true },
    })
    expect(persistedCompensation?.amount.toFixed(2)).toBe('50000.00')

    const invalidAmountResponse = await adminAgent
      .post(`/api/employments/${activeEmploymentId}/compensations`)
      .send({
        amount: '0.00',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-07-01',
      })
    expect(invalidAmountResponse.status).toBe(400)
    expect(invalidAmountResponse.body.code).toBe('INVALID_COMPENSATION_AMOUNT')

    const changeResponse = await adminAgent
      .post(`/api/employments/${activeEmploymentId}/compensations`)
      .send({
        amount: '60000',
        currency: 'DOP',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-08-01',
      })
    expect(changeResponse.status).toBe(201)
    expect(changeResponse.body.data.amount).toBe('60000.00')

    const overlapResponse = await adminAgent
      .post(`/api/employments/${activeEmploymentId}/compensations`)
      .send({
        amount: '55000.00',
        currency: 'USD',
        payFrequency: 'BIWEEKLY',
        effectiveFrom: '2026-07-15',
      })
    expect(overlapResponse.status).toBe(409)
    expect(overlapResponse.body.code).toBe('COMPENSATION_PERIOD_OVERLAP')

    const historyResponse = await adminAgent.get(
      `/api/employments/${activeEmploymentId}/compensations`,
    )
    expect(historyResponse.status).toBe(200)
    expect(historyResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: compensationId,
          amount: '50000.00',
          effectiveTo: '2026-07-31',
        }),
        expect.objectContaining({ amount: '60000.00', effectiveFrom: '2026-08-01' }),
      ]),
    )

    const detailResponse = await adminAgent.get(`/api/compensations/${compensationId}`)
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.data.amount).toBe('50000.00')

    const ownCompensationResponse = await employeeAgent.get('/api/employees/me/compensation')
    expect(ownCompensationResponse.status).toBe(200)
    expect(ownCompensationResponse.body.data.compensation.amount).toBe('60000.00')

    const employeeAdminResponse = await employeeAgent.get(
      `/api/employments/${activeEmploymentId}/compensations`,
    )
    expect(employeeAdminResponse.status).toBe(403)
    const anonymousResponse = await request(app.getHttpServer()).get(
      `/api/employees/me/compensation`,
    )
    expect(anonymousResponse.status).toBe(401)
  })
})
