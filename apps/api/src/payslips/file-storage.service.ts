import { createReadStream } from 'node:fs'
import { access, mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { Injectable } from '@nestjs/common'
import {
  assertSafeStorageKey,
  FileStorage,
  PayslipStorageFileNotFoundError,
} from './file-storage.js'

@Injectable()
export class LocalFileStorageService implements FileStorage {
  private readonly rootDirectory: string

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory)
  }

  async put(key: string, content: Uint8Array): Promise<void> {
    const path = this.resolveKey(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, { flag: 'wx' })
  }

  async get(key: string): Promise<Readable> {
    const path = this.resolveKey(key)
    try {
      await access(path)
      return createReadStream(path)
    } catch (error) {
      if (isFileNotFound(error)) {
        throw new PayslipStorageFileNotFoundError()
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolveKey(key)
    try {
      await unlink(path)
    } catch (error) {
      if (!isFileNotFound(error)) throw error
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = this.resolveKey(key)
    try {
      await access(path)
      return true
    } catch (error) {
      if (isFileNotFound(error)) return false
      throw error
    }
  }

  private resolveKey(key: string): string {
    assertSafeStorageKey(key)
    if (isAbsolute(key)) throw new Error('Unsafe storage key')

    const path = resolve(this.rootDirectory, key)
    const pathFromRoot = relative(this.rootDirectory, path)
    if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
      throw new Error('Unsafe storage key')
    }
    return path
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
