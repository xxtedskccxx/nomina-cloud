import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common'
import { DATABASE_CLIENT, prisma } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'

@Injectable()
class PrismaLifecycle implements OnModuleDestroy {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.$disconnect()
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useValue: prisma,
    },
    PrismaLifecycle,
  ],
  exports: [DATABASE_CLIENT],
})
export class PrismaModule {}
