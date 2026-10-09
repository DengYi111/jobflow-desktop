import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createByteLimitTransform } from '../../src/main/services/resumes.service'

describe('resume import byte limit', () => {
  it('stops a stream once it exceeds its maximum, even after copying has started', async () => {
    const sink = new Writable({ write: (_chunk, _encoding, callback) => callback() })
    await expect(
      pipeline(Readable.from([Buffer.alloc(3), Buffer.alloc(2)]), createByteLimitTransform(4), sink),
    ).rejects.toThrow('简历文件超出大小限制')
  })
})
