import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { Role } from '@payroll/contracts'
import { REQUIRED_ROLES } from './authorization.constants.js'
import { normalizeRole } from './roles.js'

interface RequestWithAuthUser extends Request {
  user?: {
    role?: unknown
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>()
    const role = normalizeRole(request.user?.role)

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
