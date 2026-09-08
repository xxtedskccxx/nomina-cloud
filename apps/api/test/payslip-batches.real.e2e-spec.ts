import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { jest } from '@jest/globals'
import request from 'supertest'
import { prisma } from '@payroll/database'
import { AppModule } from '../src/app.module.js'
import { auth } from '../src/auth/auth.js'
import { LocalFileStorageService } from '../src/payslips/file-storage.service.js'

jest.setTimeout(45_000)

const validPdf = (label: string) =>
  Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Label (${label}) >>\nendobj\n%%EOF\n`)

describe('Payslip upload batches against PostgreSQL', () => {
  let app: INestApplication
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  const configurationCode = `E2E-BATCH-CONFIG-${suffix}`
  const periodCode = `E2E-BATCH-PERIOD-${suffix}`
  const employeeCodes = [`E2E-BATCH-EMP-ONE-${suffix}`, `E2E-BATCH-EMP-TWO-${suffix}`]
  let adminAgent: request.SuperTest<request.Test>
  let employeeAgent: request.SuperTest<request.Test>
  let adminUserId = ''
  let employeeUserId = ''
  let configurationId = ''
  let periodId = ''
  let employeeIds: string[] = []
  const employmentIds: string[] = []
  const compensationIds: string[] = []

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleFixture.createNestApplication({ bodyParser: false })
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    )
    await app.init()

    const adminIdentity = {
      email: `batch.admin.${suffix.toLowerCase()}@example.test`,
      username: `batch_admin_${suffix.toLowerCase()}`,
      password: `Admin-${randomUUID()}-Aa1!`,
    }
    const employeeIdentity = {
      email: `batch.employee.${suffix.toLowerCase()}@example.test`,
      username: `batch_employee_${suffix.toLowerCase()}`,
      password: `Employee-${randomUUID()}-Aa1!`,
    }
    const [admin, employee] = await Promise.all([
      auth.api.createUser({
        body: {
          email: adminIdentity.email,
          name: 'Batch Admin',
          password: adminIdentity.password,
          role: 'ADMIN',
          data: { username: adminIdentity.username },
        },
      }),
      auth.api.createUser({
        body: {
          email: employeeIdentity.email,
          name: 'Batch Employee',
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

    const configurationResponse = await adminAgent.post('/api/payroll-configurations').send({
      code: configurationCode,
      name: 'Batch test configuration',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
    })
    expect(configurationResponse.status).toBe(201)
    configurationId = configurationResponse.body.data.id

    const periodResponse = await adminAgent.post('/api/payroll-periods').send({
      payrollConfigurationId: configurationId,
      code: periodCode,
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-16',
    })
    expect(periodResponse.status).toBe(201)
    periodId = periodResponse.body.data.id

    for (const [index, employeeCode] of employeeCodes.entries()) {
      const employeeResponse = await adminAgent.post('/api/employees').send({
        employeeCode,
        firstName: index === 0 ? 'Batch' : 'Retry',
        lastName: 'Employee',
        hireDate: '2025-01-01',
      })
      expect(employeeResponse.status).toBe(201)
      const employeeId = employeeResponse.body.data.id as string
      employeeIds = [...employeeIds, employeeId]
      const employmentResponse = await adminAgent
        .post(`/api/employees/${employeeId}/employments`)
        .send({ employmentType: 'FULL_TIME', startDate: '2025-01-01' })
      expect(employmentResponse.status).toBe(201)
      employmentIds.push(employmentResponse.body.data.id as string)
      const compensationResponse = await adminAgent
        .post(`/api/employments/${employmentResponse.body.data.id}/compensations`)
        .send({
          amount: '60000.00',
          currency: 'DOP',
          payFrequency: 'MONTHLY',
          effectiveFrom: '2025-01-01',
        })
      expect(compensationResponse.status).toBe(201)
      compensationIds.push(compensationResponse.body.data.id as string)
    }
    const refreshResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/participants/refresh`,
    )
    expect(refreshResponse.status).toBe(200)
  })

  afterAll(async () => {
    const storage = new LocalFileStorageService(resolve(process.cwd(), 'storage/test-payslips'))
    const payslips = periodId
      ? await prisma.payslip.findMany({
          where: { payrollPeriodId: periodId },
          select: { storageKey: true },
        })
      : []
    const batches = periodId
      ? await prisma.payslipUploadBatch.findMany({
          where: { payrollPeriodId: periodId },
          select: { items: { select: { stagingStorageKey: true } } },
        })
      : []
    await Promise.all([
      ...payslips.map((payslip) => storage.delete(payslip.storageKey)),
      ...batches.flatMap((batch) =>
        batch.items
          .filter((item) => item.stagingStorageKey)
          .map((item) => storage.delete(item.stagingStorageKey!)),
      ),
    ])
    if (periodId)
      await prisma.payslipUploadBatch.deleteMany({ where: { payrollPeriodId: periodId } })
    if (periodId) await prisma.payslip.deleteMany({ where: { payrollPeriodId: periodId } })
    if (periodId)
      await prisma.payrollParticipant.deleteMany({ where: { payrollPeriodId: periodId } })
    await prisma.payrollPeriod.deleteMany({ where: { code: periodCode } })
    await prisma.payrollConfiguration.deleteMany({ where: { code: configurationCode } })
    await prisma.compensation.deleteMany({ where: { id: { in: compensationIds } } })
    await prisma.employment.deleteMany({ where: { id: { in: employmentIds } } })
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } })
    await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.account.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, employeeUserId] } } })
    await app.close()
  })

  it('creates, resumes and partially processes a batch without blocking valid files', async () => {
    const createResponse = await adminAgent
      .post('/api/payslip-upload-batches')
      .send({ payrollPeriodId: periodId })
    expect(createResponse.status).toBe(201)
    const batchId = createResponse.body.data.id as string

    const uploadResponse = await adminAgent
      .post(`/api/payslip-upload-batches/${batchId}/files`)
      .attach('files', validPdf('one'), {
        filename: `${employeeCodes[0]}.pdf`,
        contentType: 'application/pdf',
      })
      .attach('files', validPdf('unknown'), {
        filename: 'Juan_Perez.pdf',
        contentType: 'application/pdf',
      })
      .attach('files', Buffer.from('not a PDF'), {
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
      })
    expect(uploadResponse.status).toBe(200)
    expect(uploadResponse.body.data).toMatchObject({
      batchId,
      status: 'PARTIAL',
      summary: {
        totalFiles: 3,
        processedFiles: 3,
        matchedFiles: 1,
        needsReviewFiles: 1,
        invalidFiles: 1,
      },
    })

    const detailResponse = await adminAgent.get(`/api/payslip-upload-batches/${batchId}`)
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.data.items).toHaveLength(3)
    const completedItem = detailResponse.body.data.items.find(
      (item: { status: string }) => item.status === 'COMPLETED',
    )
    expect(completedItem.matchMethod).toBe('EXACT')

    const duplicateResponse = await adminAgent
      .post(`/api/payslip-upload-batches/${batchId}/files`)
      .attach('files', validPdf('one'), {
        filename: `${employeeCodes[0]}_retry.pdf`,
        contentType: 'application/pdf',
      })
    expect(duplicateResponse.status).toBe(200)
    const itemCount = await prisma.payslipUploadItem.count({ where: { batchId } })
    expect(itemCount).toBe(3)
    expect(await prisma.payslip.count({ where: { payrollPeriodId: periodId } })).toBe(2)

    const failedItem = await prisma.payslipUploadItem.create({
      data: {
        batchId,
        originalFileName: `${employeeCodes[1]}_retry.pdf`,
        checksum: 'a'.repeat(64),
        stagingStorageKey: `upload-batches/${batchId}/retry.pdf`,
        status: 'FAILED',
        errorCode: 'PAYSLIP_PROCESSING_FAILED',
        message: 'Transient failure',
        completedAt: new Date(),
      },
    })
    const storage = new LocalFileStorageService(resolve(process.cwd(), 'storage/test-payslips'))
    await storage.put(failedItem.stagingStorageKey!, validPdf('retry'))
    const retryResponse = await adminAgent.post(`/api/payslip-upload-batches/${batchId}/retry`)
    expect(retryResponse.status).toBe(200)
    expect(retryResponse.body.data.items).toHaveLength(4)
    expect(retryResponse.body.data.items.at(-1)).toMatchObject({
      status: 'COMPLETED',
      matchMethod: 'EXACT',
    })
    expect(await prisma.payslip.count({ where: { payrollPeriodId: periodId } })).toBe(3)
  })

  it('publishes ready items while unresolved items remain pending and protects access', async () => {
    const batch = await prisma.payslipUploadBatch.findFirstOrThrow({
      where: { payrollPeriod: { code: periodCode } },
      orderBy: { createdAt: 'desc' },
    })
    const publishResponse = await adminAgent.post(`/api/payslip-upload-batches/${batch.id}/publish`)
    expect(publishResponse.status).toBe(200)
    expect(publishResponse.body.data).toMatchObject({
      published: 2,
      skipped: 2,
      unresolved: 2,
    })
    const batchAfterPublish = await prisma.payslipUploadBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { status: true },
    })
    expect(batchAfterPublish.status).toBe('PARTIAL')

    const publishedPayslip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: periodId, status: 'PUBLISHED' },
    })
    const rematchResponse = await adminAgent
      .patch(`/api/payslips/${publishedPayslip.id}/match`)
      .send({
        employeeId: employeeIds[1],
      })
    expect(rematchResponse.status).toBe(409)

    expect(
      (await request(app.getHttpServer()).get(`/api/payslip-upload-batches/${batch.id}`)).status,
    ).toBe(401)
    expect((await employeeAgent.get(`/api/payslip-upload-batches/${batch.id}`)).status).toBe(403)
  })
})
