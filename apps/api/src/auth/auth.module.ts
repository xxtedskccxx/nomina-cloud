import { Module } from '@nestjs/common'
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth'
import { auth } from './auth.js'
import { AuthFoundationController } from './auth-foundation.controller.js'

@Module({
  controllers: [AuthFoundationController],
  imports: [
    BetterAuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
    }),
  ],
})
export class AuthModule {}
