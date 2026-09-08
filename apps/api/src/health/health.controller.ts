import { Controller, Get } from '@nestjs/common'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { HealthService } from './health.service.js'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @AllowAnonymous()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({
    status: 200,
    description: 'The API process is alive.',
    schema: {
      example: { status: 'ok', service: 'payroll-api' },
    },
  })
  getHealth() {
    return this.healthService.getHealth()
  }

  @Get('ready')
  @AllowAnonymous()
  @ApiOperation({ summary: 'Readiness check including PostgreSQL' })
  @ApiResponse({
    status: 200,
    description: 'The API and PostgreSQL are ready.',
    schema: {
      example: { status: 'ok', service: 'payroll-api', database: 'ok' },
    },
  })
  @ApiResponse({ status: 503, description: 'PostgreSQL is not ready.' })
  getReadiness() {
    return this.healthService.getReadiness()
  }
}
