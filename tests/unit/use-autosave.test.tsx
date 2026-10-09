// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from '../../src/renderer/shared/useAutosave'

afterEach(() => vi.useRealTimers())

describe('useAutosave', () => {
  it('skips the initial value and coalesces edits into one debounced save', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ value, save, revision: 'job-1', enabled: true, delayMs: 300 }),
      { initialProps: { value: 'loaded' } },
    )
    rerender({ value: 'first edit' })
    rerender({ value: 'latest edit' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('latest edit')
    expect(result.current.status).toBe('saved')
  })

  it('keeps failure visible and allows retry without replacing editor content', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ value }) => useAutosave({ value, save, revision: 'job-1', enabled: true, delayMs: 100 }),
      { initialProps: { value: 'saved before' } },
    )
    rerender({ value: 'keep my draft' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('disk full')
    await act(async () => {
      await result.current.retry()
    })
    expect(save).toHaveBeenLastCalledWith('keep my draft')
    expect(result.current.status).toBe('saved')
  })

  it('flushes a pending draft when its editor unmounts', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender, unmount } = renderHook(
      ({ value }) => useAutosave({ value, save, revision: 'job-1', enabled: true, delayMs: 1000 }),
      { initialProps: { value: 'before' } },
    )
    rerender({ value: 'draft before leaving' })
    unmount()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('draft before leaving')
  })

  it('saves the previous record draft before switching the editor to another record', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ value, revision }) => useAutosave({ value, save, revision, enabled: true, delayMs: 1000 }),
      { initialProps: { value: 'record one', revision: 'one' } },
    )
    rerender({ value: 'unfinished edit', revision: 'one' })
    rerender({ value: 'record two', revision: 'two' })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledWith('unfinished edit')
    expect(save).toHaveBeenCalledTimes(1)
  })
})
