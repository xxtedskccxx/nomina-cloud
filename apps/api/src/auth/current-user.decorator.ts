import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import type { CurrentUser as CurrentUserContract } from '@payroll/contracts'
import { normalizeRole } from './roles.js'

interface RequestWithAuthUser extends Request {
  user?: {
    id?: unknown
    name?: unknown
    email?: unknown
    role?: unknown
  }
}

function getCurrentUser(request: RequestWithAuthUser): CurrentUserContract {
  const user = request.user
  const role = normalizeRole(user?.role)

  if (
    !user ||
    typeof user.id !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.email !== 'string' ||
    role === null
  ) {
    throw new UnauthorizedException('Authenticated user is not available')
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserContract => {
    const request = context.switchToHttp().getRequest<RequestWithAuthUser>()
    return getCurrentUser(request)
  },
)

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithAuthUser>()
    return getCurrentUser(request).id
  },
)
