import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { prisma } from '@payroll/database'
import { AppModule } from '../src/app.module.js'
import { auth } from '../src/auth/auth.js'

function testSuffix(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
}

describe('Organization domain against PostgreSQL', () => {
  let app: INestApplication
  const suffix = testSuffix()
  const departmentCode = `E2E-${suffix}`
  const positionCode = `P-${suffix}`
  const employeeCode = `EMP-${suffix}`
  const secondEmployeeCode = `EMP2-${suffix}`
  let adminAgent: request.SuperTest<request.Test>
  let employeeAgent: request.SuperTest<request.Test>
  let departmentId = ''
  let positionId = ''
  let optionalEmployeeId = ''
  let linkedEmployeeId = ''
  let adminUserId = ''
  let employeeUserId = ''

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
      email: `admin.${suffix.toLowerCase()}@example.test`,
      username: `admin_${suffix.toLowerCase()}`,
      password: `Admin-${randomUUID()}-Aa1!`,
    }
    const employeeIdentity = {
      email: `employee.${suffix.toLowerCase()}@example.test`,
      username: `employee_${suffix.toLowerCase()}`,
      password: `Employee-${randomUUID()}-Aa1!`,
    }

    const [admin, employee] = await Promise.all([
      auth.api.createUser({
        body: {
          email: adminIdentity.email,
          name: 'E2E Organization Admin',
          password: adminIdentity.password,
          role: 'ADMIN',
          data: { username: adminIdentity.username },
        },
      }),
      auth.api.createUser({
        body: {
          email: employeeIdentity.email,
          name: 'E2E Organization Employee',
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
    await prisma.employee.deleteMany({
      where: { employeeCode: { in: [employeeCode, secondEmployeeCode] } },
    })
    await prisma.position.deleteMany({ where: { code: positionCode } })
    await prisma.department.deleteMany({ where: { code: departmentCode } })
    await prisma.session.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.account.deleteMany({ where: { userId: { in: [adminUserId, employeeUserId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, employeeUserId] } } })
    await app.close()
  })

  it('allows ADMIN to manage departments and rejects duplicates', async () => {
    const createResponse = await adminAgent.post('/api/departments').send({
      code: departmentCode,
      name: 'Engineering',
      description: 'E2E department',
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data).toMatchObject({ code: departmentCode, isActive: true })
    departmentId = createResponse.body.data.id

    const getResponse = await adminAgent.get(`/api/departments/${departmentId}`)
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.data.id).toBe(departmentId)

    const duplicateResponse = await adminAgent.post('/api/departments').send({
      code: departmentCode.toLowerCase(),
      name: 'Duplicate Engineering',
    })
    expect(duplicateResponse.status).toBe(409)
    expect(duplicateResponse.body.code).toBe('DEPARTMENT_CODE_ALREADY_EXISTS')

    const listResponse = await adminAgent.get('/api/departments')
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: departmentId })]),
    )

    const updateResponse = await adminAgent.patch(`/api/departments/${departmentId}`).send({
      isActive: false,
    })
    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.data.isActive).toBe(false)
  })

  it('allows ADMIN to create/filter positions and validates departments', async () => {
    const createResponse = await adminAgent.post('/api/positions').send({
      code: positionCode,
      name: 'Software Developer',
      departmentId,
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.data).toMatchObject({
      code: positionCode,
      department: { id: departmentId },
    })
    positionId = createResponse.body.data.id

    const getResponse = await adminAgent.get(`/api/positions/${positionId}`)
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.data.id).toBe(positionId)

    const filteredResponse = await adminAgent.get('/api/positions').query({
      departmentId,
      isActive: true,
    })
    expect(filteredResponse.status).toBe(200)
    expect(filteredResponse.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: positionId })]),
    )

    const deactivateResponse = await adminAgent.patch(`/api/positions/${positionId}`).send({
      isActive: false,
    })
    expect(deactivateResponse.status).toBe(200)
    expect(deactivateResponse.body.data.isActive).toBe(false)

    const inactiveResponse = await adminAgent.get('/api/positions').query({
      departmentId,
      isActive: false,
    })
    expect(inactiveResponse.status).toBe(200)
    expect(inactiveResponse.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: positionId, isActive: false })]),
    )

    const employeeMutationResponse = await employeeAgent.post('/api/positions').send({
      code: `EMP-${suffix}`,
      name: 'Not Allowed',
    })
    expect(employeeMutationResponse.status).toBe(403)

    const anonymousResponse = await request(app.getHttpServer()).get('/api/positions')
    expect(anonymousResponse.status).toBe(401)

    const invalidResponse = await adminAgent.post('/api/positions').send({
      code: `BAD-${suffix}`,
      name: 'Invalid Position',
      departmentId: 'missing-department',
    })
    expect(invalidResponse.status).toBe(404)
    expect(invalidResponse.body.code).toBe('DEPARTMENT_NOT_FOUND')
  })

  it('creates employees, supports relations, pagination and rejects duplicate links', async () => {
    const optionalUserResponse = await adminAgent.post('/api/employees').send({
      employeeCode,
      firstName: 'Ada',
      lastName: 'Lovelace',
      hireDate: '2025-01-01',
      departmentId,
      positionId,
    })
    expect(optionalUserResponse.status).toBe(201)
    expect(optionalUserResponse.body.data).toMatchObject({
      employeeCode,
      userId: null,
      department: { id: departmentId },
      position: { id: positionId },
    })
    optionalEmployeeId = optionalUserResponse.body.data.id

    const employeeCodeConflictResponse = await adminAgent.post('/api/employees').send({
      employeeCode,
      firstName: 'Duplicate',
      lastName: 'Code',
      hireDate: '2025-04-01',
    })
    expect(employeeCodeConflictResponse.status).toBe(409)
    expect(employeeCodeConflictResponse.body.code).toBe('EMPLOYEE_CODE_ALREADY_EXISTS')

    const linkedUserResponse = await adminAgent.post('/api/employees').send({
      employeeCode: secondEmployeeCode,
      firstName: 'Grace',
      lastName: 'Hopper',
      hireDate: '2025-02-01',
      userId: employeeUserId,
    })
    expect(linkedUserResponse.status).toBe(201)
    linkedEmployeeId = linkedUserResponse.body.data.id
    expect(linkedUserResponse.body.data.userId).toBe(employeeUserId)

    const linkOptionalResponse = await adminAgent
      .patch(`/api/employees/${optionalEmployeeId}`)
      .send({ userId: adminUserId })
    expect(linkOptionalResponse.status).toBe(200)
    expect(linkOptionalResponse.body.data.userId).toBe(adminUserId)

    const unlinkOptionalResponse = await adminAgent
      .patch(`/api/employees/${optionalEmployeeId}`)
      .send({ userId: null })
    expect(unlinkOptionalResponse.status).toBe(200)
    expect(unlinkOptionalResponse.body.data.userId).toBeNull()

    const duplicateLinkResponse = await adminAgent.post('/api/employees').send({
      employeeCode: `EMP3-${suffix}`,
      firstName: 'Duplicate',
      lastName: 'Portal',
      hireDate: '2025-03-01',
      userId: employeeUserId,
    })
    expect(duplicateLinkResponse.status).toBe(409)
    expect(duplicateLinkResponse.body.code).toBe('USER_ALREADY_LINKED_TO_EMPLOYEE')

    const invalidUserResponse = await adminAgent.post('/api/employees').send({
      employeeCode: `EMP3-${suffix}`,
      firstName: 'Missing',
      lastName: 'User',
      hireDate: '2025-03-01',
      userId: 'missing-user',
    })
    expect(invalidUserResponse.status).toBe(404)
    expect(invalidUserResponse.body.code).toBe('USER_NOT_FOUND')

    const invalidEmployeeDepartmentResponse = await adminAgent.post('/api/employees').send({
      employeeCode: `EMP3-${suffix}`,
      firstName: 'Missing',
      lastName: 'Department',
      hireDate: '2025-03-01',
      departmentId: 'missing-department',
    })
    expect(invalidEmployeeDepartmentResponse.status).toBe(404)
    expect(invalidEmployeeDepartmentResponse.body.code).toBe('DEPARTMENT_NOT_FOUND')

    const invalidDocumentResponse = await adminAgent.post('/api/employees').send({
      employeeCode: `EMP3-${suffix}`,
      firstName: 'Invalid',
      lastName: 'Document',
      hireDate: '2025-03-01',
      documentType: 'CEDULA',
    })
    expect(invalidDocumentResponse.status).toBe(400)
    expect(invalidDocumentResponse.body.code).toBe('DOCUMENT_FIELDS_MUST_MATCH')

    const paginatedResponse = await adminAgent.get('/api/employees').query({
      page: 1,
      pageSize: 1,
      search: 'Ada',
      status: 'ACTIVE',
      departmentId,
      positionId,
    })
    expect(paginatedResponse.status).toBe(200)
    expect(paginatedResponse.body.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 })
    expect(paginatedResponse.body.data).toHaveLength(1)

    const adminDetailResponse = await adminAgent.get(`/api/employees/${linkedEmployeeId}`)
    expect(adminDetailResponse.status).toBe(200)

    const defaultPaginationResponse = await adminAgent.get('/api/employees')
    expect(defaultPaginationResponse.status).toBe(200)
    expect(defaultPaginationResponse.body.pagination.pageSize).toBe(20)

    const oversizedPageResponse = await adminAgent.get('/api/employees').query({ pageSize: 101 })
    expect(oversizedPageResponse.status).toBe(400)
  })

  it('restricts employee access to /me and keeps anonymous requests out', async () => {
    const ownProfileResponse = await employeeAgent.get('/api/employees/me')
    expect(ownProfileResponse.status).toBe(200)
    expect(ownProfileResponse.body.data).toMatchObject({ employeeCode: secondEmployeeCode })

    const listResponse = await employeeAgent.get('/api/employees')
    expect(listResponse.status).toBe(403)

    const detailResponse = await employeeAgent.get(`/api/employees/${linkedEmployeeId}`)
    expect(detailResponse.status).toBe(403)

    const departmentListResponse = await employeeAgent.get('/api/departments')
    expect(departmentListResponse.status).toBe(403)

    const anonymousDepartmentResponse = await request(app.getHttpServer()).get('/api/departments')
    expect(anonymousDepartmentResponse.status).toBe(401)

    const employeeDepartmentMutationResponse = await employeeAgent
      .patch(`/api/departments/${departmentId}`)
      .send({ isActive: true })
    expect(employeeDepartmentMutationResponse.status).toBe(403)

    const anonymousEmployeeListResponse = await request(app.getHttpServer()).get('/api/employees')
    expect(anonymousEmployeeListResponse.status).toBe(401)

    const anonymousEmployeeMutationResponse = await request(app.getHttpServer())
      .post('/api/employees')
      .send({
        employeeCode: `ANON-${suffix}`,
        firstName: 'No',
        lastName: 'Access',
        hireDate: '2025-01-01',
      })
    expect(anonymousEmployeeMutationResponse.status).toBe(401)

    const anonymousResponse = await request(app.getHttpServer()).get('/api/employees/me')
    expect(anonymousResponse.status).toBe(401)
  })
})
