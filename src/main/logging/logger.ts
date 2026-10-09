import fs from 'node:fs/promises'
import path from 'node:path'
import { redactLogText } from './redaction'

export type LogLevel = 'info' | 'warn' | 'error'
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
  flush(): Promise<void>
}

const maximumBytes = 2 * 1024 * 1024
const retainedFiles = 3

function safeJson(value: unknown): string {
  try {
    return redactLogText(JSON.stringify(value) ?? String(value))
  } catch {
    return '[字段无法序列化]'
  }
}

export function createLogger(directory: string): Logger {
  const logPath = path.join(directory, 'jobflow.log')
  let pendingWrites = Promise.resolve()

  async function rotateIfNeeded(nextBytes: number) {
    const current = await fs.stat(logPath).catch(() => undefined)
    if (!current || current.size + nextBytes <= maximumBytes) return
    await fs.rm(`${logPath}.${retainedFiles}`, { force: true })
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
      await fs
        .rename(`${logPath}.${index}`, `${logPath}.${index + 1}`)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
    }
    await fs.rename(logPath, `${logPath}.1`)
  }

  function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
    const line = `${JSON.stringify({ at: new Date().toISOString(), level, event: redactLogText(event), fields: safeJson(fields) })}\n`
    pendingWrites = pendingWrites.then(async () => {
      try {
        await fs.mkdir(directory, { recursive: true })
        await rotateIfNeeded(Buffer.byteLength(line))
        await fs.appendFile(logPath, line, { encoding: 'utf8', mode: 0o600 })
      } catch {
        /* Logging failures must never stop the application. */
      }
    })
  }

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    flush: () => pendingWrites,
  }
}
