import { Readable } from 'node:stream'
import { jest } from '@jest/globals'
import type { S3Client } from '@aws-sdk/client-s3'
import { PayslipStorageFileNotFoundError } from '../payslips/file-storage.js'
import { S3FileStorageService } from './s3-file-storage.service.js'

describe('S3FileStorageService', () => {
  const bucket = 'private-payslips'
  let send: jest.MockedFunction<S3Client['send']>
  let storage: S3FileStorageService

  beforeEach(() => {
    send = jest.fn() as unknown as jest.MockedFunction<S3Client['send']>
    storage = new S3FileStorageService({ send } as unknown as S3Client, bucket)
  })

  it('uploads PDF content using the opaque key and private-by-default command options', async () => {
    send.mockResolvedValue({} as never)

    await storage.put('period-a/opaque-id.pdf', Buffer.from('pdf'))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: bucket,
        Key: 'period-a/opaque-id.pdf',
        ContentType: 'application/pdf',
      },
    })
    expect(send.mock.calls[0]?.[0]).not.toMatchObject({ input: { ACL: expect.anything() } })
  })

  it('streams an existing object', async () => {
    send.mockResolvedValue({ Body: Readable.from([Buffer.from('pdf')]) } as never)

    const stream = await storage.get('period-a/opaque-id.pdf')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))

    expect(Buffer.concat(chunks).toString()).toBe('pdf')
  })

  it('maps a missing object to the storage boundary error', async () => {
    send.mockRejectedValue({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })

    await expect(storage.get('period-a/missing.pdf')).rejects.toBeInstanceOf(
      PayslipStorageFileNotFoundError,
    )
  })

  it('checks existence and deletes objects', async () => {
    send.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } } as never)
    await expect(storage.exists('period-a/opaque-id.pdf')).resolves.toBe(true)

    send.mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
    await expect(storage.exists('period-a/missing.pdf')).resolves.toBe(false)

    send.mockResolvedValueOnce({} as never)
    await storage.delete('period-a/opaque-id.pdf')
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('propagates storage unavailability and timeout errors', async () => {
    const unavailable = new Error('storage unavailable')
    send.mockRejectedValue(unavailable)

    await expect(storage.put('period-a/opaque-id.pdf', Buffer.from('pdf'))).rejects.toBe(
      unavailable,
    )
    await expect(storage.get('period-a/opaque-id.pdf')).rejects.toBe(unavailable)
    await expect(storage.exists('period-a/opaque-id.pdf')).rejects.toBe(unavailable)
    await expect(storage.delete('period-a/opaque-id.pdf')).rejects.toBe(unavailable)
  })

  it.each(['../outside.pdf', 'period/../outside.pdf', '..\\outside.pdf', '/absolute.pdf'])(
    'rejects unsafe object keys before calling S3: %s',
    async (key) => {
      await expect(storage.put(key, Buffer.from('pdf'))).rejects.toThrow('Unsafe storage key')
      await expect(storage.get(key)).rejects.toThrow('Unsafe storage key')
      await expect(storage.exists(key)).rejects.toThrow('Unsafe storage key')
      await expect(storage.delete(key)).rejects.toThrow('Unsafe storage key')
      expect(send).not.toHaveBeenCalled()
    },
  )
})
