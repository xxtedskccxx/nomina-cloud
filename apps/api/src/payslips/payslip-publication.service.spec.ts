import { jest } from '@jest/globals'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'
import { PayslipPublicationService } from './payslip-publication.service.js'

describe('PayslipPublicationService', () => {
  it('keeps a valid publication when the notification stub fails', async () => {
    const now = new Date('2026-09-03T00:00:00.000Z')
    const draft = {
      id: 'payslip-1',
      status: PayslipStatus.DRAFT,
      employeeId: 'employee-1',
      matchStatus: PayslipMatchStatus.MATCHED,
      storageKey: 'period-1/payslip-1.pdf',
    }
    const published = {
      id: draft.id,
      employeeId: draft.employeeId,
      payrollPeriodId: 'period-1',
      originalFileName: 'employee-1.pdf',
      mimeType: 'application/pdf',
      fileSize: 42,
      checksum: 'checksum-1',
      status: PayslipStatus.PUBLISHED,
      matchStatus: PayslipMatchStatus.MATCHED,
      matchMethod: 'EXACT',
      reviewReason: null,
      uploadedAt: now,
      publishedAt: now,
      archivedAt: null,
      employee: null,
      payrollPeriod: {
        id: 'period-1',
        code: 'PERIOD-1',
        startDate: now,
        endDate: now,
        paymentDate: now,
      },
    }
    const findUnique = jest.fn<() => Promise<typeof draft>>()
    findUnique.mockResolvedValue(draft)
    const update = jest.fn<() => Promise<typeof published>>()
    update.mockResolvedValue(published)
    const database = {
      payslip: {
        findUnique,
        update,
      },
    }
    const exists = jest.fn<() => Promise<boolean>>()
    exists.mockResolvedValue(true)
    const storage = { exists }
    const publishPayslipPublished = jest.fn<() => Promise<void>>()
    publishPayslipPublished.mockRejectedValue(new Error('stub unavailable'))
    const notifications = {
      publishPayslipPublished,
    }
    const logger = { warn: jest.fn() }
    const service = new PayslipPublicationService(
      database as never,
      storage as never,
      notifications as never,
      logger as never,
    )

    const result = await service.publish(draft.id, 'admin-1')

    expect(result.data.status).toBe(PayslipStatus.PUBLISHED)
    expect(database.payslip.update).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      { actorUserId: 'admin-1', payslipId: draft.id },
      'Payslip notification failed after publication',
    )
  })
})
