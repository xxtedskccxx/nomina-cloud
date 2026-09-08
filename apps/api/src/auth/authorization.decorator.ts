import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { AuthGuard as BetterAuthGuard } from '@thallesp/nestjs-better-auth'
import { UserRole } from '@payroll/contracts'
import type { Role } from '@payroll/contracts'
import { RolesGuard } from './roles.guard.js'
import { REQUIRED_ROLES } from './authorization.constants.js'

export { REQUIRED_ROLES }

export function Authenticated(): MethodDecorator & ClassDecorator {
  return UseGuards(BetterAuthGuard)
}

export function Roles(...roles: Role[]): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(BetterAuthGuard, RolesGuard), SetMetadata(REQUIRED_ROLES, roles))
}

export function AdminOnly(): MethodDecorator & ClassDecorator {
  return Roles(UserRole.ADMIN)
}
