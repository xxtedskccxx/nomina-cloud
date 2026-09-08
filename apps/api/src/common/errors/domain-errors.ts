import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message })
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message })
}

export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message })
}

export function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
