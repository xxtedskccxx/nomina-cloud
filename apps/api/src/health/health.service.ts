import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'

export interface HealthResponse {
  status: 'ok'
  service: 'payroll-api'
}

export interface ReadinessResponse extends HealthResponse {
  database: 'ok'
}

@Injectable()
export class HealthService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'payroll-api',
    }
  }

  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.database.$queryRaw`SELECT 1`
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not ready',
      })
    }

    return {
      ...this.getHealth(),
      database: 'ok',
    }
  }
}
