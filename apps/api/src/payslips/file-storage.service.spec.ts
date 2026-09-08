import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalFileStorageService } from './file-storage.service.js'

describe('LocalFileStorageService', () => {
  let root: string
  let storage: LocalFileStorageService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'payroll-payslips-'))
    storage = new LocalFileStorageService(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('puts, checks, gets and deletes a file', async () => {
    const content = Buffer.from('%PDF-1.7\n%%EOF\n')

    await storage.put('period-a/one.pdf', content)

    expect(await storage.exists('period-a/one.pdf')).toBe(true)
    const stream = await storage.get('period-a/one.pdf')
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(content)

    await storage.delete('period-a/one.pdf')
    expect(await storage.exists('period-a/one.pdf')).toBe(false)
  })

  it('rejects path traversal and reports missing files', async () => {
    await expect(storage.put('../outside.pdf', Buffer.from('x'))).rejects.toThrow(
      'Unsafe storage key',
    )
    await expect(storage.put('..\\outside.pdf', Buffer.from('x'))).rejects.toThrow(
      'Unsafe storage key',
    )
    await expect(storage.get('C:\\outside.pdf')).rejects.toThrow('Unsafe storage key')
    await expect(storage.get('missing.pdf')).rejects.toMatchObject({
      code: 'PAYSLIP_FILE_NOT_FOUND',
    })
  })
})
