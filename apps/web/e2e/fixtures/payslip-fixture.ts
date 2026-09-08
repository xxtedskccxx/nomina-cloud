import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { prisma } from '../../../../packages/database/src/index.ts'

export interface BrowserFixture {
  adminUsername: string
  adminPassword: string
  employeeUsername: string
  employeePassword: string
  periodCode: string
  periodId: string
  employeeCode: string
  reviewEmployeeCode: string
  batchId: string
  publishedPayslipId: string
}

const apiBaseUrl = (process.env.E2E_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '')
const fixturePdfPath = resolve(process.cwd(), 'apps/web/e2e/fixtures/payslip-test.pdf')

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for browser E2E tests`)
  return value
}

async function readFixture(label: string): Promise<Buffer> {
  const template = await readFile(fixturePdfPath, 'utf8')
  return Buffer.from(template.replace('PAYSLIP TEST', label))
}

async function assertResponse(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  ...statuses: number[]
) {
  if (!statuses.includes(response.status())) {
    throw new Error(`Fixture API request failed (${response.status()}): ${await response.text()}`)
  }
}

async function createEmployee(
  api: APIRequestContext,
  employeeCode: string,
  userId?: string,
): Promise<{ id: string; employmentId: string }> {
  const employeeResponse = await api.post('employees', {
    data: {
      employeeCode,
      firstName: employeeCode.includes('REVIEW') ? 'Review' : 'Browser',
      lastName: 'Employee',
      hireDate: '2025-01-01',
      ...(userId ? { userId } : {}),
    },
  })
  await assertResponse(employeeResponse, 201)
  const employeeId = (await employeeResponse.json()).data.id as string
  const employmentResponse = await api.post(`employees/${employeeId}/employments`, {
    data: { employmentType: 'FULL_TIME', startDate: '2025-01-01' },
  })
  await assertResponse(employmentResponse, 201)
  return { id: employeeId, employmentId: (await employmentResponse.json()).data.id as string }
}

async function createCompensation(api: APIRequestContext, employmentId: string) {
  const response = await api.post(`employments/${employmentId}/compensations`, {
    data: {
      amount: '60000.00',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
      effectiveFrom: '2025-01-01',
    },
  })
  await assertResponse(response, 201)
}

export async function createBrowserFixture(): Promise<BrowserFixture> {
  const api = await playwrightRequest.newContext({
    baseURL: `${apiBaseUrl}/`,
    extraHTTPHeaders: { Origin: 'http://localhost:3000' },
  })
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
  const adminUsername = requiredEnvironment('SEED_ADMIN_USERNAME')
  const adminPassword = requiredEnvironment('SEED_ADMIN_PASSWORD')
  const employeeUsername = `e2e_employee_${suffix.toLowerCase()}`
  const employeePassword = `E2E-${randomUUID()}-Aa1!`
  const employeeEmail = `${employeeUsername}@example.test`
  const periodCode = `E2E-BROWSER-${suffix}`
  const employeeCode = `E2E-BROWSER-EMP-${suffix}`
  const reviewEmployeeCode = `E2E-BROWSER-REVIEW-${suffix}`

  const signIn = await api.post('auth/sign-in/username', {
    data: { username: adminUsername, password: adminPassword },
  })
  await assertResponse(signIn, 200)
  const session = await api.get('auth/get-session')
  await assertResponse(session, 200)
  const sessionUser = (await session.json()).user
  if (sessionUser?.role !== 'ADMIN') {
    throw new Error('Browser E2E fixture could not establish an ADMIN session')
  }
  const signup = await api.post('auth/sign-up/email', {
    data: {
      email: employeeEmail,
      name: 'Browser Employee',
      password: employeePassword,
      username: employeeUsername,
    },
  })
  await assertResponse(signup, 200)
  const employeeUserId = (await signup.json()).user.id as string

  // Better Auth establishes the newly created user's session after sign-up.
  // Restore the seeded admin session before creating admin-owned payroll data.
  const restoredAdminSession = await api.post('auth/sign-in/username', {
    data: { username: adminUsername, password: adminPassword },
  })
  await assertResponse(restoredAdminSession, 200)

  const configurationResponse = await api.post('payroll-configurations', {
    data: {
      code: `E2E-BROWSER-CONFIG-${suffix}`,
      name: 'Browser E2E configuration',
      currency: 'DOP',
      payFrequency: 'MONTHLY',
    },
  })
  await assertResponse(configurationResponse, 201)
  const configurationId = (await configurationResponse.json()).data.id as string
  const periodResponse = await api.post('payroll-periods', {
    data: {
      payrollConfigurationId: configurationId,
      code: periodCode,
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      paymentDate: '2026-09-16',
    },
  })
  await assertResponse(periodResponse, 201)
  const periodId = (await periodResponse.json()).data.id as string
  const employee = await createEmployee(api, employeeCode, employeeUserId)
  const reviewEmployee = await createEmployee(api, reviewEmployeeCode)
  await createCompensation(api, employee.employmentId)
  await createCompensation(api, reviewEmployee.employmentId)
  const refresh = await api.post(`payroll-periods/${periodId}/participants/refresh`)
  await assertResponse(refresh, 200)

  const publishedUpload = await api.post(`payroll-periods/${periodId}/payslips/upload`, {
    multipart: {
      files: {
        name: `${employeeCode}.pdf`,
        mimeType: 'application/pdf',
        buffer: await readFixture('PUBLISHED TEST'),
      },
    },
  })
  await assertResponse(publishedUpload, 201)
  const publishedItem = (await publishedUpload.json()).data.items[0]
  const publish = await api.post(`payroll-periods/${periodId}/payslips/publish`)
  await assertResponse(publish, 200)

  const reviewUpload = await api.post(`payroll-periods/${periodId}/payslips/upload`, {
    multipart: {
      files: {
        name: 'needs-review.pdf',
        mimeType: 'application/pdf',
        buffer: await readFixture('REVIEW TEST'),
      },
    },
  })
  await assertResponse(reviewUpload, 201)
  const reviewBatch = (await reviewUpload.json()).data

  await api.dispose()
  return {
    adminUsername,
    adminPassword,
    employeeUsername,
    employeePassword,
    periodCode,
    periodId,
    employeeCode,
    reviewEmployeeCode,
    batchId: reviewBatch.batchId as string,
    publishedPayslipId: publishedItem.payslipId as string,
  }
}

export async function cleanupBrowserFixture(fixture: BrowserFixture): Promise<void> {
  const storageRoot = resolve(process.cwd(), 'storage/test-payslips')
  const payslips = await prisma.payslip.findMany({
    where: { payrollPeriodId: fixture.periodId },
    select: { storageKey: true },
  })
  const batches = await prisma.payslipUploadBatch.findMany({
    where: { payrollPeriodId: fixture.periodId },
    select: { items: { select: { stagingStorageKey: true } } },
  })
  await Promise.all(
    [
      ...payslips.map((item) => item.storageKey),
      ...batches.flatMap((batch) =>
        batch.items
          .map((item) => item.stagingStorageKey)
          .filter((key): key is string => Boolean(key)),
      ),
    ].map(async (key) => unlink(resolve(storageRoot, key)).catch(() => undefined)),
  )
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: fixture.periodId },
    select: { payrollConfigurationId: true },
  })
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { in: [fixture.employeeCode, fixture.reviewEmployeeCode] } },
    select: { id: true },
  })
  const employeeIds = employees.map((employee) => employee.id)
  const user = await prisma.user.findUnique({
    where: { username: fixture.employeeUsername },
    select: { id: true },
  })
  if (fixture.periodId)
    await prisma.payslipUploadBatch.deleteMany({ where: { payrollPeriodId: fixture.periodId } })
  await prisma.payslip.deleteMany({ where: { payrollPeriodId: fixture.periodId } })
  await prisma.payrollParticipant.deleteMany({ where: { payrollPeriodId: fixture.periodId } })
  await prisma.payrollPeriod.deleteMany({ where: { id: fixture.periodId } })
  if (period)
    await prisma.payrollConfiguration.deleteMany({ where: { id: period.payrollConfigurationId } })
  const employments = await prisma.employment.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true },
  })
  await prisma.compensation.deleteMany({
    where: { employmentId: { in: employments.map((item) => item.id) } },
  })
  await prisma.employment.deleteMany({ where: { id: { in: employments.map((item) => item.id) } } })
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } })
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } })
    await prisma.account.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined)
  }
}
