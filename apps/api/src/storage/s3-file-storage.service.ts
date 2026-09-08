import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'node:stream'
import {
  assertSafeStorageKey,
  FileStorage,
  PayslipStorageFileNotFoundError,
} from '../payslips/file-storage.js'

export class S3FileStorageService implements FileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, content: Uint8Array): Promise<void> {
    assertSafeStorageKey(key)
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(content),
        ContentType: 'application/pdf',
      }),
    )
  }

  async get(key: string): Promise<Readable> {
    assertSafeStorageKey(key)
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!response.Body) throw new PayslipStorageFileNotFoundError()
      return toNodeReadable(response.Body)
    } catch (error) {
      if (isMissingObject(error)) throw new PayslipStorageFileNotFoundError()
      throw error
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key)
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (error) {
      if (isMissingObject(error)) return false
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    assertSafeStorageKey(key)
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
      throw new Error('Signed URL expiry must be between 1 and 900 seconds')
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    })
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('name' in error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) return true
  if ('$metadata' in error) {
    const metadata = error.$metadata
    return (
      typeof metadata === 'object' &&
      metadata !== null &&
      'httpStatusCode' in metadata &&
      metadata.httpStatusCode === 404
    )
  }
  return false
}

async function toNodeReadable(body: unknown): Promise<Readable> {
  if (body instanceof Readable) return body
  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>
  }
  if (candidate.transformToByteArray) return Readable.from([await candidate.transformToByteArray()])
  return Readable.from(body as AsyncIterable<Uint8Array>)
}
