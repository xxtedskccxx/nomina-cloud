import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { PinoLogger } from 'nestjs-pino'

interface ErrorResponse {
  statusCode: number
  code: string
  message: string
  path: string
  timestamp: string
}

interface ExceptionResponse {
  code?: unknown
  message?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getPublicMessage(statusCode: number, response: unknown): string {
  if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return 'Internal server error'
  }

  if (typeof response === 'string') {
    return response
  }

  if (isRecord(response) && typeof response.message === 'string') {
    return response.message
  }

  if (isRecord(response) && Array.isArray(response.message)) {
    return 'Invalid request'
  }

  return 'Request failed'
}

function getPublicCode(statusCode: number, response: unknown): string {
  if (isRecord(response) && typeof response.code === 'string') {
    return response.code
  }

  if (statusCode === HttpStatus.BAD_REQUEST) {
    return 'VALIDATION_ERROR'
  }

  return 'HTTP_ERROR'
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const response = context.getResponse<Response>()
    const request = context.getRequest<Request>()
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined
    const errorResponse: ErrorResponse = {
      statusCode,
      code: getPublicCode(statusCode, exceptionResponse as ExceptionResponse),
      message: getPublicMessage(statusCode, exceptionResponse),
      path: request.url,
      timestamp: new Date().toISOString(),
    }

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, method: request.method, path: request.url },
        'Unhandled error',
      )
    } else {
      this.logger.warn({ method: request.method, path: request.url, statusCode }, 'Request failed')
    }

    response.status(statusCode).json(errorResponse)
  }
}
