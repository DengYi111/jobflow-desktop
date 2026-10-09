// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { ApplicationTimeline } from '../../src/renderer/features/jobs/ApplicationTimeline'

afterEach(cleanup)
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  window.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
})

describe('application timeline', () => {
  it('allows editing and deleting a stage event while preserving its stage classification', async () => {
    const event = {
      id: 'event-stage',
      title: '收到测评',
      type: 'STAGE_CHANGED',
      stage: 'ASSESSMENT_PENDING' as const,
      eventAt: '2026-09-20T09:00:00.000Z',
      channel: null,
      notes: null,
      interviewId: null,
      interviewRoundNumber: null,
      interviewType: null,
    }
    const updateEvent = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    const deleteEvent = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    window.jobflow = {
      applications: {
        listTimeline: vi.fn().mockResolvedValue({ ok: true, data: [event] }),
        updateEvent,
        deleteEvent,
      },
      changes: { subscribe: vi.fn(() => () => {}) },
    } as unknown as JobFlowApi
    render(<ApplicationTimeline applicationId="application-1" onChanged={vi.fn()} />)

    const eventContent = (await screen.findByText(event.title)).closest('.timeline-event') as HTMLElement
    expect(within(eventContent).getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(within(eventContent).getByRole('button', { name: '删除' })).toBeTruthy()
    fireEvent.click(within(eventContent).getByRole('button', { name: '编辑' }))
    const dialog = await screen.findByRole('dialog', { name: '编辑流程记录' })
    expect(within(dialog).queryByLabelText('记录类型')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('记录标题'), { target: { value: '测评已收到' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /保存修改/ }))

    await waitFor(() =>
      expect(updateEvent).toHaveBeenCalledWith({
        id: event.id,
        title: '测评已收到',
        at: expect.any(String),
        notes: '',
      }),
    )
    expect(updateEvent.mock.calls[0][0]).not.toHaveProperty('stage')

    const updatedContent = (await screen.findByText(event.title)).closest('.timeline-event') as HTMLElement
    fireEvent.click(within(updatedContent).getByRole('button', { name: '删除' }))
    expect(await screen.findByText('删除这条时间线记录？')).toBeTruthy()
  })
})
