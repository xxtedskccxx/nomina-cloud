import { HttpException, Inject, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'
import { DATABASE_CLIENT } from '@payroll/database'
import type { DatabaseClient } from '@payroll/database'
import { NotificationService } from '../notifications/notification.service.js'
import { conflict, hasDatabaseErrorCode, notFound } from '../common/errors/domain-errors.js'
import { FILE_STORAGE } from './file-storage.js'
import type { FileStorage } from './file-storage.js'
import { payslipSelect, serializePayslip } from './payslip-shared.js'

@Injectable()
export class PayslipPublicationService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly notifications: NotificationService,
    private readonly logger: PinoLogger,
  ) {}

  async publish(id: string, actorUserId: string) {
    const payslip = await this.database.payslip.findUnique({
      where: { id },
      select: { id: true, status: true, employeeId: true, matchStatus: true, storageKey: true },
    })
    if (!payslip) throw notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw conflict('PAYSLIP_NOT_DRAFT', 'Only draft payslips can be published')
    }
    if (!payslip.employeeId || payslip.matchStatus !== PayslipMatchStatus.MATCHED) {
      throw conflict('PAYSLIP_NEEDS_REVIEW', 'Match the payslip to an employee before publishing')
    }
    if (!(await this.storage.exists(payslip.storageKey))) {
      throw notFound('PAYSLIP_FILE_NOT_FOUND', 'Payslip file is not available')
    }

    try {
      const updated = await this.database.payslip.update({
        where: { id },
        data: {
          status: PayslipStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedByUserId: actorUserId,
        },
        select: payslipSelect,
      })
      try {
        await this.notifications.publishPayslipPublished({
          type: 'PayslipPublished',
          payslipId: updated.id,
          employeeId: updated.employeeId!,
          payrollPeriodId: updated.payrollPeriodId,
          publishedAt: updated.publishedAt!.toISOString(),
        })
      } catch {
        this.logger.warn(
          { actorUserId, payslipId: updated.id },
          'Payslip notification failed after publication',
        )
      }
      return { data: serializePayslip(updated) }
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw this.mapPersistenceError(error)
    }
  }

  async publishAll(periodId: string, actorUserId: string) {
    const period = await this.database.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    })
    if (!period) throw notFound('PAYROLL_PERIOD_NOT_FOUND', 'Payroll period not found')
    const drafts = await this.database.payslip.findMany({
      where: { payrollPeriodId: periodId, status: PayslipStatus.DRAFT },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    return {
      data: await this.publishIds(
        drafts.map((draft) => draft.id),
        actorUserId,
      ),
    }
  }

  async publishIds(ids: readonly string[], actorUserId: string) {
    const items: Array<{ payslipId: string; status: 'PUBLISHED' | 'SKIPPED'; reason?: string }> = []
    for (const id of ids) {
      const payslip = await this.database.payslip.findUnique({
        where: { id },
        select: { id: true, status: true, employeeId: true, matchStatus: true, storageKey: true },
      })
      if (!payslip) {
        items.push({ payslipId: id, status: 'SKIPPED', reason: 'PAYSLIP_NOT_FOUND' })
        continue
      }
      if (!payslip.employeeId || payslip.matchStatus !== PayslipMatchStatus.MATCHED) {
        items.push({ payslipId: id, status: 'SKIPPED', reason: 'NEEDS_REVIEW' })
        continue
      }
      if (payslip.status !== PayslipStatus.DRAFT) {
        items.push({ payslipId: id, status: 'SKIPPED', reason: 'NOT_DRAFT' })
        continue
      }
      if (!(await this.storage.exists(payslip.storageKey))) {
        items.push({ payslipId: id, status: 'SKIPPED', reason: 'FILE_NOT_FOUND' })
        continue
      }
      try {
        await this.publish(id, actorUserId)
        items.push({ payslipId: id, status: 'PUBLISHED' })
      } catch (error) {
        if (error instanceof HttpException) {
          items.push({ payslipId: id, status: 'SKIPPED', reason: 'PUBLISH_REJECTED' })
          continue
        }
        throw error
      }
    }
    return {
      total: ids.length,
      published: items.filter((item) => item.status === 'PUBLISHED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
      items,
    }
  }

  private mapPersistenceError(error: unknown): Error {
    if (error instanceof HttpException) return error
    if (hasDatabaseErrorCode(error, 'P2002')) {
      return conflict('DUPLICATE_PAYSLIP', 'A payslip already exists for this employee and period')
    }
    if (hasDatabaseErrorCode(error, 'P2025')) {
      return notFound('PAYSLIP_NOT_FOUND', 'Payslip not found')
    }
    return error instanceof Error ? error : new Error('Payslip publication failed')
  }
}
