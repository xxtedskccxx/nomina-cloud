import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { parseEnvironment } from '@payroll/config'
import type { Environment } from '@payroll/config'
import { AuthModule } from './auth/auth.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'
import { CompensationsModule } from './compensations/compensations.module.js'
import { PrismaModule } from './config/prisma.module.js'
import { DepartmentsModule } from './departments/departments.module.js'
import { EmployeesModule } from './employees/employees.module.js'
import { EmploymentsModule } from './employments/employments.module.js'
import { HealthModule } from './health/health.module.js'
import { PositionsModule } from './positions/positions.module.js'
import { PayrollConfigurationsModule } from './payroll-configurations/payroll-configurations.module.js'
import { PayrollPeriodsModule } from './payroll-periods/payroll-periods.module.js'
import { PayslipsModule } from './payslips/payslips.module.js'

const packageDirectory = dirname(fileURLToPath(import.meta.url))

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [resolve(packageDirectory, '../../../.env'), resolve(process.cwd(), '.env')],
      validate: (configuration) => parseEnvironment(configuration),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment>) => {
        const nodeEnvironment = configService.get<string>('NODE_ENV') ?? 'development'
        const logLevel = configService.get<Environment['LOG_LEVEL']>('LOG_LEVEL') ?? 'info'

        return {
          pinoHttp: {
            level: logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers.set-cookie',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },
            transport:
              nodeEnvironment === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { singleLine: true, colorize: true },
                  }
                : undefined,
          },
        }
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    DepartmentsModule,
    PositionsModule,
    EmployeesModule,
    EmploymentsModule,
    CompensationsModule,
    PayrollConfigurationsModule,
    PayrollPeriodsModule,
    PayslipsModule,
    HealthModule,
  ],
  providers: [
    HttpExceptionFilter,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
