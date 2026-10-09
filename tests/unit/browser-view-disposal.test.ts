import { describe, expect, it, vi } from 'vitest'
import { createViewDisposer } from '../../electron/browser/view-disposal'

describe('browser view disposal', () => {
  it('detaches and closes a live view once', () => {
    const detach = vi.fn()
    const close = vi.fn()
    const dispose = createViewDisposer(
      () => false,
      () => false,
      detach,
      close,
    )

    dispose()
    dispose()

    expect(detach).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not detach from a destroyed window or close destroyed web contents', () => {
    const detach = vi.fn()
    const close = vi.fn()
    const dispose = createViewDisposer(
      () => true,
      () => true,
      detach,
      close,
    )

    dispose()

    expect(detach).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('still closes live web contents if its window was closed first', () => {
    const detach = vi.fn()
    const close = vi.fn()
    const dispose = createViewDisposer(
      () => true,
      () => false,
      detach,
      close,
    )

    dispose()

    expect(detach).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })
})
