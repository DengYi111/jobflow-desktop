import { describe, expect, it, vi } from 'vitest'
import { clearBrowserSession } from '../../electron/browser/clear-browser-session'

describe('clear browser session', () => {
  it('clears only the dedicated browser session and reloads open pages', async () => {
    const order: string[] = []
    const session = {
      clearStorageData: vi.fn(async () => {
        order.push('storage')
      }),
      clearCache: vi.fn(async () => {
        order.push('cache')
      }),
    }
    const first = { reload: vi.fn(() => order.push('first')) }
    const second = { reload: vi.fn(() => order.push('second')) }

    await clearBrowserSession(session, [first, second])

    expect(order).toEqual(['storage', 'cache', 'first', 'second'])
  })
})
