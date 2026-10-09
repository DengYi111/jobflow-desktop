import { describe, expect, it, vi } from 'vitest'
import { createLinksService } from '../../src/main/services/links.service'

describe('external links service', () => {
  it('opens only valid HTTP and HTTPS URLs', async () => {
    const open = vi.fn(async () => undefined)
    const links = createLinksService(open)
    await links.openExternal('https://example.com/jobs/1')
    await links.openExternal('http://example.com')
    expect(open).toHaveBeenCalledTimes(2)
    for (const url of [
      'javascript:alert(1)',
      'file:///windows/system.ini',
      'data:text/html,hello',
      'not a url',
    ]) {
      await expect(links.openExternal(url)).rejects.toThrow()
    }
    expect(open).toHaveBeenCalledTimes(2)
  })
})
