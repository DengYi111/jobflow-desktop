import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '../../src/main/logging/logger'
import { redactLogText } from '../../src/main/logging/redaction'

describe('log redaction', () => {
  it('removes common personal and session data before it reaches the log sink', () => {
    const source =
      'phone 13800138000 email lin@example.com id 110105199001011234 Cookie: session=secret Authorization: Bearer abc123 https://jobs.test/apply?token=private'
    const safe = redactLogText(source)
    expect(safe).not.toContain('13800138000')
    expect(safe).not.toContain('lin@example.com')
    expect(safe).not.toContain('110105199001011234')
    expect(safe).not.toContain('secret')
    expect(safe).not.toContain('abc123')
    expect(safe).not.toContain('private')
  })

  it('writes structured records without preserving secrets in the log file', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobflow-log-test-'))
    try {
      const logger = createLogger(directory)
      logger.error('browser.request.failed', {
        url: 'https://example.test/apply?token=secret',
        phone: '13800138000',
      })
      await logger.flush()
      const output = await fs.readFile(path.join(directory, 'jobflow.log'), 'utf8')
      expect(output).toContain('browser.request.failed')
      expect(output).not.toContain('secret')
      expect(output).not.toContain('13800138000')
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
