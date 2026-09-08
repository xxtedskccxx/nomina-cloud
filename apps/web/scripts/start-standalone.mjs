import { cp, mkdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const standaloneRoot = resolve(appRoot, '.next', 'standalone')
const standaloneAppRoot = resolve(standaloneRoot, 'apps', 'web')

await mkdir(resolve(standaloneAppRoot, '.next'), { recursive: true })
await cp(resolve(appRoot, '.next', 'static'), resolve(standaloneAppRoot, '.next', 'static'), {
  recursive: true,
  force: true,
})

try {
  await access(resolve(appRoot, 'public'))
  await cp(resolve(appRoot, 'public'), resolve(standaloneAppRoot, 'public'), {
    recursive: true,
    force: true,
  })
} catch {
  // This application does not require a public directory.
}

const server = spawn(process.execPath, ['apps/web/server.js'], {
  cwd: standaloneRoot,
  env: process.env,
  stdio: 'inherit',
})

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
