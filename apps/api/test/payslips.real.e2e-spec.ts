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

jest.setTimeout(30_000)

function testSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
}

const validPdf = (label: string) =>
  Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Label (${label}) >>\nendobj\n%%EOF\n`)

describe('Payslips against PostgreSQL', () => {
  let app: INestApplication
  const suffix = testSuffix()
  const configurationCode = `E2E-PAYSLIP-CONFIG-${suffix}`
  const periodCode = `E2E-PAYSLIP-PERIOD-${suffix}`
  const employeeCodes = [`E2E-PAYSLIP-EMP-${suffix}`, `E2E-PAYSLIP-REVIEW-${suffix}`]
  let adminAgent: request.SuperTest<request.Test>
  let employeeAgent: request.SuperTest<request.Test>
  let adminUserId = ''
  let employeeUserId = ''
  let configurationId = ''
  let periodId = ''
  let employeeId = ''
  let reviewEmployeeId = ''
  let firstPayslipId = ''
  let reviewPayslipId = ''
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
      email: `payslip.admin.${suffix.toLowerCase()}@example.test`,
      username: `payslip_admin_${suffix.toLowerCase()}`,
      password: `Admin-${randomUUID()}-Aa1!`,
    }
    const employeeIdentity = {
      email: `payslip.employee.${suffix.toLowerCase()}@example.test`,
      username: `payslip_employee_${suffix.toLowerCase()}`,
      password: `Employee-${randomUUID()}-Aa1!`,
    }
    const [admin, employee] = await Promise.all([
      auth.api.createUser({
        body: {
          email: adminIdentity.email,
          name: 'E2E Payslip Admin',
          password: adminIdentity.password,
          role: 'ADMIN',
          data: { username: adminIdentity.username },
        },
      }),
      auth.api.createUser({
        body: {
          email: employeeIdentity.email,
          name: 'E2E Payslip Employee',
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
      name: 'E2E Payslip Config',
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

    const createEmployee = async (code: string, userId?: string) => {
      const response = await adminAgent.post('/api/employees').send({
        employeeCode: code,
        firstName: code.includes('REVIEW') ? 'Review' : 'Portal',
        lastName: 'Employee',
        hireDate: '2025-01-01',
        ...(userId ? { userId } : {}),
      })
      expect(response.status).toBe(201)
      return response.body.data.id as string
    }
    employeeId = await createEmployee(employeeCodes[0]!, employeeUserId)
    reviewEmployeeId = await createEmployee(employeeCodes[1]!)

    for (const id of [employeeId, reviewEmployeeId]) {
      const employmentResponse = await adminAgent.post(`/api/employees/${id}/employments`).send({
        employmentType: 'FULL_TIME',
        startDate: '2025-01-01',
      })
      expect(employmentResponse.status).toBe(201)
      const employmentId = employmentResponse.body.data.id as string
      employmentIds.push(employmentId)
      const compensationResponse = await adminAgent
        .post(`/api/employments/${employmentId}/compensations`)
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
    expect(refreshResponse.body.count).toBeGreaterThanOrEqual(2)
  })

  afterAll(async () => {
    const payslips = periodId
      ? await prisma.payslip.findMany({
          where: { payrollPeriodId: periodId },
          select: { storageKey: true },
        })
      : []
    const storage = new LocalFileStorageService(resolve(process.cwd(), 'storage/test-payslips'))
    await Promise.all(payslips.map((payslip) => storage.delete(payslip.storageKey)))
    if (periodId) {
      const batches = await prisma.payslipUploadBatch.findMany({
        where: { payrollPeriodId: periodId },
        select: { items: { select: { stagingStorageKey: true } } },
      })
      await Promise.all(
        batches.flatMap((batch) =>
          batch.items
            .filter((item) => item.stagingStorageKey)
            .map((item) => storage.delete(item.stagingStorageKey!)),
        ),
      )
      await prisma.payslipUploadBatch.deleteMany({ where: { payrollPeriodId: periodId } })
    }
    if (periodId) await prisma.payslip.deleteMany({ where: { payrollPeriodId: periodId } })
    if (periodId)
      await prisma.payrollParticipant.deleteMany({ where: { payrollPeriodId: periodId } })
    await prisma.payrollPeriod.deleteMany({ where: { code: periodCode } })
    await prisma.payrollConfiguration.deleteMany({ where: { code: configurationCode } })
    await prisma.compensation.deleteMany({ where: { id: { in: compensationIds } } })
    await prisma.employment.deleteMany({ where: { id: { in: employmentIds } } })
    await prisma.employee.deleteMany({ where: { id: { in: [employeeId, reviewEmployeeId] } } })
    await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.account.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, employeeUserId] } } })
    await app.close()
  })

  it('uploads a batch independently, matches by employee code and leaves exceptions reviewable', async () => {
    const uploadResponse = await adminAgent
      .post(`/api/payroll-periods/${periodId}/payslips/upload`)
      .attach('files', validPdf('matched'), {
        filename: `Volante_${employeeCodes[0]}_2026-09-15.pdf`,
        contentType: 'application/pdf',
      })
      .attach('files', validPdf('review'), {
        filename: 'Volante_sin-codigo_2026-09-15.pdf',
        contentType: 'application/pdf',
      })
      .attach('files', Buffer.from('not a PDF'), {
        filename: 'not-a-pdf.pdf',
        contentType: 'application/pdf',
      })

    expect(uploadResponse.status).toBe(201)
    expect(uploadResponse.body.data).toMatchObject({
      total: 3,
      uploaded: 2,
      matched: 1,
      needsReview: 1,
      duplicates: 0,
      invalid: 1,
    })
    const matchedItem = uploadResponse.body.data.items.find(
      (item: { status: string }) => item.status === 'UPLOADED',
    )
    const reviewItem = uploadResponse.body.data.items.find(
      (item: { status: string }) => item.status === 'NEEDS_REVIEW',
    )
    firstPayslipId = matchedItem.payslipId
    reviewPayslipId = reviewItem.payslipId
    expect(matchedItem.employee.employeeCode).toBe(employeeCodes[0])
    expect(reviewItem.employee).toBeNull()

    const listResponse = await adminAgent.get(`/api/payroll-periods/${periodId}/payslips`)
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.summary).toMatchObject({ participants: 3, draft: 2, missing: 2 })
    expect(listResponse.body.data[0]).not.toHaveProperty('storageKey')

    const assignResponse = await adminAgent.patch(`/api/payslips/${reviewPayslipId}/match`).send({
      employeeId: reviewEmployeeId,
    })
    expect(assignResponse.status).toBe(200)
    expect(assignResponse.body.data).toMatchObject({
      employeeId: reviewEmployeeId,
      matchStatus: 'MATCHED',
      status: 'DRAFT',
    })

    const missingResponse = await adminAgent.get(
      `/api/payroll-periods/${periodId}/payslips/missing`,
    )
    expect(missingResponse.status).toBe(200)
    expect(missingResponse.body.pagination.total).toBe(1)
  })

  it('detects duplicate checksums and publishes only matched documents', async () => {
    const duplicateResponse = await adminAgent
      .post(`/api/payroll-periods/${periodId}/payslips/upload`)
      .attach('files', validPdf('matched'), {
        filename: `${employeeCodes[0]}.pdf`,
        contentType: 'application/pdf',
      })
    expect(duplicateResponse.status).toBe(201)
    expect(duplicateResponse.body.data).toMatchObject({ duplicates: 1, uploaded: 0 })
    expect(duplicateResponse.body.data.items[0]).toMatchObject({ status: 'DUPLICATE' })

    const publishResponse = await adminAgent.post(
      `/api/payroll-periods/${periodId}/payslips/publish`,
    )
    expect(publishResponse.status).toBe(200)
    expect(publishResponse.body.data).toMatchObject({ total: 2, published: 2, skipped: 0 })

    const employeeListResponse = await employeeAgent.get('/api/employees/me/payslips')
    expect(employeeListResponse.status).toBe(200)
    expect(employeeListResponse.body.pagination.total).toBe(1)
    expect(employeeListResponse.body.data[0]).toMatchObject({
      id: firstPayslipId,
      status: 'PUBLISHED',
      payrollPeriod: { code: periodCode, paymentDate: '2026-09-16' },
    })
    expect(employeeListResponse.body.data[0]).not.toHaveProperty('storageKey')
  })

  it('streams only the owner published PDF and protects drafts, foreign documents and anonymous users', async () => {
    const ownDetail = await employeeAgent.get(`/api/employees/me/payslips/${firstPayslipId}`)
    expect(ownDetail.status).toBe(200)
    expect(ownDetail.body.data.fileName).toContain(employeeCodes[0])

    const inlineResponse = await employeeAgent.get(
      `/api/employees/me/payslips/${firstPayslipId}/file`,
    )
    expect(inlineResponse.status).toBe(200)
    expect(inlineResponse.headers['content-type']).toContain('application/pdf')
    expect(inlineResponse.headers['content-disposition']).toContain('inline')
    expect(inlineResponse.headers['x-frame-options']).toBeUndefined()
    expect(inlineResponse.headers['content-security-policy']).toContain('http://localhost:3000')
    expect(inlineResponse.body.toString()).toContain('%PDF-1.7')

    const downloadResponse = await employeeAgent.get(
      `/api/employees/me/payslips/${firstPayslipId}/file?download=true`,
    )
    expect(downloadResponse.status).toBe(200)
    expect(downloadResponse.headers['content-disposition']).toContain('attachment')

    const foreignResponse = await employeeAgent.get(`/api/employees/me/payslips/${reviewPayslipId}`)
    expect(foreignResponse.status).toBe(404)
    const anonymousResponse = await request(app.getHttpServer()).get(
      `/api/employees/me/payslips/${firstPayslipId}/file`,
    )
    expect(anonymousResponse.status).toBe(401)

    const adminResponse = await employeeAgent.get(`/api/payroll-periods/${periodId}/payslips`)
    expect(adminResponse.status).toBe(403)
  })

  it('enforces the anonymous, EMPLOYEE and IDOR authorization matrix', async () => {
    const latestBatch = await prisma.payslipUploadBatch.findFirstOrThrow({
      where: { payrollPeriodId: periodId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    const anonymous = request(app.getHttpServer())
    const employee = employeeAgent
    const anonymousChecks = [
      anonymous.get('/api/employees'),
      anonymous.get('/api/payroll-periods'),
      anonymous.get('/api/payslip-upload-batches'),
      anonymous.get(`/api/payroll-periods/${periodId}/payslips`),
      anonymous.get(`/api/payslips/${firstPayslipId}`),
      anonymous.get(`/api/payslips/${firstPayslipId}/file`),
      anonymous.get('/api/employees/me'),
      anonymous.get('/api/employees/me/payslips'),
      anonymous.post(`/api/payslip-upload-batches/${latestBatch.id}/publish`),
      anonymous.post(`/api/payslips/${firstPayslipId}/publish`),
      anonymous.delete(`/api/payslips/${firstPayslipId}`),
    ]
    const anonymousResponses = await Promise.all(anonymousChecks)
    expect(anonymousResponses.every((response) => response.status === 401)).toBe(true)

    const employeeChecks = [
      employee.get('/api/employees'),
      employee.get('/api/payroll-periods'),
      employee.get('/api/payslip-upload-batches'),
      employee.get(`/api/payroll-periods/${periodId}/payslips`),
      employee.get(`/api/payslips/${firstPayslipId}`),
      employee.get(`/api/payslips/${firstPayslipId}/file`),
      employee.post(`/api/payslip-upload-batches/${latestBatch.id}/publish`),
      employee.post(`/api/payslips/${firstPayslipId}/publish`),
      employee.post(`/api/payslips/${firstPayslipId}/archive`),
      employee.delete(`/api/payslips/${firstPayslipId}`),
    ]
    const employeeResponses = await Promise.all(employeeChecks)
    expect(employeeResponses.every((response) => response.status === 403)).toBe(true)

    const foreignDetail = await employee.get(`/api/employees/me/payslips/${reviewPayslipId}`)
    const foreignFile = await employee.get(`/api/employees/me/payslips/${reviewPayslipId}/file`)
    expect(foreignDetail.status).toBe(404)
    expect(foreignFile.status).toBe(404)
  })

  it('replaces explicitly, archives the old version and prevents deleting published history', async () => {
    const replacementResponse = await adminAgent
      .post(`/api/payslips/${firstPayslipId}/replace`)
      .attach('file', validPdf('replacement'), {
        filename: `replacement_${employeeCodes[0]}.pdf`,
        contentType: 'application/pdf',
      })
    expect(replacementResponse.status).toBe(200)
    const replacementId = replacementResponse.body.data.id as string
    expect(replacementResponse.body.data).toMatchObject({ status: 'DRAFT', employeeId })

    const oldRecord = await prisma.payslip.findUnique({
      where: { id: firstPayslipId },
      select: { status: true, archivedAt: true },
    })
    expect(oldRecord).toMatchObject({ status: 'ARCHIVED' })
    expect(oldRecord?.archivedAt).toBeInstanceOf(Date)

    const deletePublishedResponse = await adminAgent.delete(`/api/payslips/${firstPayslipId}`)
    expect(deletePublishedResponse.status).toBe(409)
    const publishReplacementResponse = await adminAgent.post(
      `/api/payslips/${replacementId}/publish`,
    )
    expect(publishReplacementResponse.status).toBe(200)
    const employeeListResponse = await employeeAgent.get('/api/employees/me/payslips')
    expect(employeeListResponse.body.data).toHaveLength(1)
    expect(employeeListResponse.body.data[0].id).toBe(replacementId)
  })

  it('enforces PostgreSQL foreign keys and the active employee-period uniqueness rule', async () => {
    const duplicate = await prisma.payslip
      .create({
        data: {
          employeeId,
          payrollPeriodId: periodId,
          originalFileName: 'duplicate.pdf',
          storageKey: `${periodId}/${randomUUID()}.pdf`,
          mimeType: 'application/pdf',
          fileSize: validPdf('duplicate').length,
          checksum: 'f'.repeat(64),
          status: 'DRAFT',
          matchStatus: 'MATCHED',
        },
      })
      .catch((error: unknown) => error)
    expect(duplicate).toMatchObject({ code: 'P2002' })

    const deleteEmployee = await prisma.employee
      .delete({ where: { id: employeeId } })
      .catch((error: unknown) => error)
    expect(deleteEmployee).toMatchObject({ code: 'P2003' })
    const deletePeriod = await prisma.payrollPeriod
      .delete({ where: { id: periodId } })
      .catch((error: unknown) => error)
    expect(deletePeriod).toMatchObject({ code: 'P2003' })
  })
})
