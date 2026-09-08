import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
if (process.env.NODE_ENV !== 'production' && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFilePath)
  } catch {
    // Ignored in production
  }
}

import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'
import { parseEnvironment } from '@payroll/config'
import { AppModule } from './app.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env)
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  })

  if (environment.TRUST_PROXY_HOPS > 0) {
    const httpServer = app.getHttpAdapter().getInstance() as {
      set: (setting: string, value: number) => void
    }
    httpServer.set('trust proxy', environment.TRUST_PROXY_HOPS)
  }
  app.enableShutdownHooks()

  app.useLogger(app.get(Logger))
  app.use(
    helmet({
      contentSecurityPolicy: environment.NODE_ENV === 'production',
    }),
  )
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  app.useGlobalFilters(app.get(HttpExceptionFilter))

  if (environment.NODE_ENV !== 'production' && environment.SWAGGER_ENABLED) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Payroll API')
      .setDescription('Foundation API for the employee payroll portal')
      .setVersion('0.1.0')
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document)
  }

  await app.listen(environment.API_PORT, '0.0.0.0')
}

void bootstrap()
