import { randomUUID } from 'node:crypto'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { prisma } from '@payroll/database'
import { AppModule } from '../src/app.module.js'
import { auth } from '../src/auth/auth.js'

function createTestIdentity(prefix: string): {
  email: string
  username: string
  password: string
} {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 20)

  return {
    email: `${prefix}.${suffix}@example.test`,
    username: `${prefix}_${suffix}`,
    password: `E2e-${randomUUID()}-Aa1!`,
  }
}

describe('Better Auth against PostgreSQL', () => {
  let app: INestApplication

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
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports readiness when the real PostgreSQL connection is available', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: 'ok',
      service: 'payroll-api',
      database: 'ok',
    })
  })

  it('allows an anonymous request to the public foundation route', async () => {
    const response = await request(app.getHttpServer()).get('/api/auth-foundation/public')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ access: 'public' })
  })

  it('registers, persists and signs in an EMPLOYEE with username', async () => {
    const identity = createTestIdentity('employee')
    const employeeAgent = request.agent(app.getHttpServer())

    const signupResponse = await employeeAgent.post('/api/auth/sign-up/email').send({
      email: identity.email,
      name: 'E2E Employee',
      password: identity.password,
      username: identity.username,
    })

    expect(signupResponse.status).toBe(200)
    expect(signupResponse.body.user).toMatchObject({
      email: identity.email,
      username: identity.username,
      role: 'EMPLOYEE',
    })

    const persistedUser = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { email: true, username: true, role: true },
    })

    expect(persistedUser).toEqual({
      email: identity.email,
      username: identity.username,
      role: 'EMPLOYEE',
    })

    const sessionResponse = await employeeAgent.get('/api/auth/get-session')

    expect(sessionResponse.status).toBe(200)
    expect(sessionResponse.body.user).toMatchObject({
      email: identity.email,
      username: identity.username,
      role: 'EMPLOYEE',
    })

    const signinAgent = request.agent(app.getHttpServer())
    const signinResponse = await signinAgent.post('/api/auth/sign-in/username').send({
      username: identity.username,
      password: identity.password,
    })

    expect(signinResponse.status).toBe(200)
    expect(signinResponse.body.user).toMatchObject({
      email: identity.email,
      role: 'EMPLOYEE',
    })

    const signinSession = await signinAgent.get('/api/auth/get-session')

    expect(signinSession.status).toBe(200)
    expect(signinSession.body.user).toMatchObject({
      email: identity.email,
      role: 'EMPLOYEE',
    })

    const authenticatedResponse = await employeeAgent.get('/api/auth-foundation/me')
    const employeeRouteResponse = await employeeAgent.get('/api/auth-foundation/employee')
    const adminRouteResponse = await employeeAgent.get('/api/auth-foundation/admin')

    expect(authenticatedResponse.status).toBe(200)
    expect(authenticatedResponse.body).toEqual({ access: 'authenticated', role: 'EMPLOYEE' })
    expect(employeeRouteResponse.status).toBe(200)
    expect(employeeRouteResponse.body).toEqual({ access: 'employee', role: 'EMPLOYEE' })
    expect(adminRouteResponse.status).toBe(403)
  })

  it('enforces public, authenticated, ADMIN-only and employee-accessible routes', async () => {
    const identity = createTestIdentity('admin')
    const adminCreation = await auth.api.createUser({
      body: {
        email: identity.email,
        name: 'E2E Admin',
        password: identity.password,
        role: 'ADMIN',
        data: { username: identity.username },
      },
    })

    expect(adminCreation.user).toMatchObject({
      email: identity.email,
      username: identity.username,
      role: 'ADMIN',
    })

    const adminAgent = request.agent(app.getHttpServer())
    const signinResponse = await adminAgent.post('/api/auth/sign-in/username').send({
      username: identity.username,
      password: identity.password,
    })

    expect(signinResponse.status).toBe(200)

    const anonymousResponse = await request(app.getHttpServer()).get('/api/auth-foundation/me')
    const adminResponse = await adminAgent.get('/api/auth-foundation/admin')
    const employeeRouteResponse = await adminAgent.get('/api/auth-foundation/employee')

    expect(anonymousResponse.status).toBe(401)
    expect(adminResponse.status).toBe(200)
    expect(adminResponse.body).toEqual({ access: 'admin', role: 'ADMIN' })
    expect(employeeRouteResponse.status).toBe(200)
    expect(employeeRouteResponse.body).toEqual({ access: 'employee', role: 'ADMIN' })
  })
})
