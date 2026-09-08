import { jest } from '@jest/globals'
import { PayslipMatchStatus, PayslipStatus } from '@payroll/contracts'
import { PayslipsService } from './payslips.service.js'

const validPdf = (label: string) =>
  Buffer.from(`%PDF-1.7\n${label}\n${' '.repeat(20)}%%EOF`, 'ascii')

describe('PayslipsService replacement storage atomicity', () => {
  it('uploads the replacement before archiving the current database record', async () => {
    const current = {
      id: 'payslip-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      status: PayslipStatus.PUBLISHED,
    }
    const replacement = {
      id: 'replacement-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      originalFileName: 'replacement.pdf',
      mimeType: 'application/pdf',
      fileSize: 42,
      checksum: 'checksum',
      status: PayslipStatus.DRAFT,
      matchStatus: PayslipMatchStatus.MATCHED,
      matchMethod: 'MANUAL',
      reviewReason: null,
      uploadedAt: new Date('2026-09-03T00:00:00.000Z'),
      publishedAt: null,
      archivedAt: null,
      employee: null,
      payrollPeriod: {
        id: 'period-1',
        code: 'PERIOD-1',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-30T00:00:00.000Z'),
        paymentDate: new Date('2026-09-30T00:00:00.000Z'),
      },
    }
    const findUnique = jest.fn<() => Promise<typeof current>>()
    findUnique.mockResolvedValue(current)
    const findFirst = jest.fn<() => Promise<null>>()
    findFirst.mockResolvedValue(null)
    const transaction = {
      $executeRaw: jest.fn<() => Promise<unknown>>(),
      payslip: {
        findUnique: jest.fn<() => Promise<typeof current>>().mockResolvedValue(current),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
        create: jest.fn<() => Promise<unknown>>().mockResolvedValue(replacement),
      },
    }
    const transactionRunner =
      jest.fn<(callback: (value: typeof transaction) => unknown) => Promise<unknown>>()
    transactionRunner.mockImplementation(async (callback) => callback(transaction))
    const database = {
      payslip: { findUnique, findFirst },
      $transaction: transactionRunner,
    }
    const storage = {
      put: jest.fn<(key: string, content: Uint8Array) => Promise<void>>(),
      delete: jest.fn<(key: string) => Promise<void>>(),
    }
    const batches = { refreshForPayslip: jest.fn() }
    const configService = { get: jest.fn().mockReturnValue(20_000_000) }
    const logger = { info: jest.fn(), warn: jest.fn() }
    const service = new PayslipsService(
      database as never,
      storage as never,
      configService as never,
      batches as never,
      {} as never,
      logger as never,
    )
    const file = validPdf('replacement')

    const result = await service.replace(
      'payslip-1',
      {
        originalname: 'replacement.pdf',
        mimetype: 'application/pdf',
        size: file.byteLength,
        buffer: file,
      },
      'admin-1',
    )

    expect(result.data.id).toBe('replacement-1')
    expect(storage.put).toHaveBeenCalledTimes(1)
    expect(database.$transaction).toHaveBeenCalledTimes(1)
    expect(storage.put.mock.invocationCallOrder[0]).toBeLessThan(
      database.$transaction.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it('does not open a database transaction when the replacement upload fails', async () => {
    const current = {
      id: 'payslip-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      status: PayslipStatus.PUBLISHED,
    }
    const database = {
      payslip: {
        findUnique: jest.fn<() => Promise<typeof current>>().mockResolvedValue(current),
        findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      },
      $transaction: jest.fn<() => Promise<unknown>>(),
    }
    const storageError = new Error('storage unavailable')
    const storage = {
      put: jest
        .fn<(key: string, content: Uint8Array) => Promise<void>>()
        .mockRejectedValue(storageError),
      delete: jest.fn<(key: string) => Promise<void>>(),
    }
    const service = new PayslipsService(
      database as never,
      storage as never,
      { get: jest.fn().mockReturnValue(20_000_000) } as never,
      { refreshForPayslip: jest.fn() } as never,
      {} as never,
      { info: jest.fn(), warn: jest.fn() } as never,
    )
    const file = validPdf('replacement')

    await expect(
      service.replace(
        'payslip-1',
        {
          originalname: 'replacement.pdf',
          mimetype: 'application/pdf',
          size: file.byteLength,
          buffer: file,
        },
        'admin-1',
      ),
    ).rejects.toBe(storageError)
    expect(database.$transaction).not.toHaveBeenCalled()
  })

  it('keeps the database error when best-effort orphan cleanup also fails', async () => {
    const current = {
      id: 'payslip-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      status: PayslipStatus.PUBLISHED,
    }
    const findUnique = jest.fn<() => Promise<typeof current>>().mockResolvedValue(current)
    const findFirst = jest.fn<() => Promise<null>>().mockResolvedValue(null)
    const databaseError = new Error('database unavailable')
    const database = {
      payslip: { findUnique, findFirst },
      $transaction: jest.fn<() => Promise<unknown>>().mockRejectedValue(databaseError),
    }
    const cleanupError = new Error('storage cleanup unavailable')
    const storage = {
      put: jest
        .fn<(key: string, content: Uint8Array) => Promise<void>>()
        .mockResolvedValue(undefined),
      delete: jest.fn<(key: string) => Promise<void>>().mockRejectedValue(cleanupError),
    }
    const logger = { info: jest.fn(), warn: jest.fn() }
    const service = new PayslipsService(
      database as never,
      storage as never,
      { get: jest.fn().mockReturnValue(20_000_000) } as never,
      { refreshForPayslip: jest.fn() } as never,
      {} as never,
      logger as never,
    )
    const file = validPdf('replacement')

    await expect(
      service.replace(
        'payslip-1',
        {
          originalname: 'replacement.pdf',
          mimetype: 'application/pdf',
          size: file.byteLength,
          buffer: file,
        },
        'admin-1',
      ),
    ).rejects.toBe(databaseError)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ payslipId: 'payslip-1' }),
      'Replacement storage cleanup failed',
    )
  })
})
