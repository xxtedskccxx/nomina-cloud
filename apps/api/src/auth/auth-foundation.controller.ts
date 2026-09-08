import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { UserRole } from '@payroll/contracts'
import { Authenticated, AdminOnly, Roles } from './authorization.decorator.js'
import { CurrentUser } from './current-user.decorator.js'
import type { CurrentUser as CurrentUserContract } from '@payroll/contracts'

@ApiTags('auth-foundation')
@Controller('auth-foundation')
export class AuthFoundationController {
  @Get('public')
  @AllowAnonymous()
  @ApiOperation({ summary: 'Public authorization foundation probe' })
  getPublicAccess(): { access: 'public' } {
    return { access: 'public' }
  }

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'Authenticated authorization foundation probe' })
  getAuthenticatedAccess(@CurrentUser() user: CurrentUserContract): {
    access: 'authenticated'
    role: CurrentUserContract['role']
  } {
    return { access: 'authenticated', role: user.role }
  }

  @Get('admin')
  @AdminOnly()
  @ApiOperation({ summary: 'ADMIN-only authorization foundation probe' })
  getAdminAccess(@CurrentUser() user: CurrentUserContract): {
    access: 'admin'
    role: typeof UserRole.ADMIN
  } {
    return { access: 'admin', role: user.role as typeof UserRole.ADMIN }
  }

  @Get('employee')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Employee-accessible authorization foundation probe' })
  getEmployeeAccess(@CurrentUser() user: CurrentUserContract): {
    access: 'employee'
    role: CurrentUserContract['role']
  } {
    return { access: 'employee', role: user.role }
  }
}
