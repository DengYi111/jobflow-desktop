import { describe, expect, it, vi } from 'vitest'
import { createNotificationScheduler } from '../../src/main/services/notifications.service'

const due = {
  id: 'interview-1',
  kind: 'INTERVIEW' as const,
  title: '星河科技面试提醒',
  body: '技术面 · 嵌入式工程师',
  companyName: '星河科技',
  jobTitle: '嵌入式工程师',
  notificationAt: '2026-10-01T01:30:00.000Z',
  jobId: 'job-1',
}

describe('desktop notification scheduler', () => {
  it('sends each due item once and records the entity kind and id', async () => {
    let pending = [due]
    const findDue = vi.fn(() => pending)
    const notify = vi.fn()
    const markSent = vi.fn((kind: string, id: string) => {
      pending = pending.filter((item) => item.id !== id || item.kind !== kind)
    })
    const scheduler = createNotificationScheduler({
      findDue,
      notify,
      markSent,
      now: () => new Date('2026-10-01T01:31:00.000Z'),
    })

    await scheduler.runOnce()
    await scheduler.runOnce()

    expect(findDue).toHaveBeenCalledWith('2026-10-01T01:31:00.000Z')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(due)
    expect(markSent).toHaveBeenCalledTimes(1)
    expect(markSent).toHaveBeenCalledWith('INTERVIEW', 'interview-1', '2026-10-01T01:31:00.000Z')
  })

  it('does not query or send reminders when global notifications are disabled', async () => {
    const findDue = vi.fn(() => [due])
    const notify = vi.fn()
    const scheduler = createNotificationScheduler({
      isEnabled: () => false,
      findDue,
      notify,
      markSent: vi.fn(),
    })

    await scheduler.runOnce()

    expect(findDue).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not mark a notification sent if the desktop notification fails', async () => {
    const markSent = vi.fn()
    const scheduler = createNotificationScheduler({
      findDue: () => [due],
      notify: () => {
        throw new Error('unsupported')
      },
      markSent,
    })
    await scheduler.runOnce()
    expect(markSent).not.toHaveBeenCalled()
  })

  it('does not confuse stage and custom-action reminders for the same application', async () => {
    const stage = { ...due, id: 'application-1', kind: 'STAGE' as const, title: '待笔试提醒' }
    const custom = { ...due, id: 'application-1', kind: 'CUSTOM' as const, title: '自定义行动提醒' }
    const markSent = vi.fn()
    const scheduler = createNotificationScheduler({
      findDue: () => [stage, custom],
      notify: vi.fn(),
      markSent,
    })

    await scheduler.runOnce()

    expect(markSent).toHaveBeenNthCalledWith(1, 'STAGE', 'application-1', expect.any(String))
    expect(markSent).toHaveBeenNthCalledWith(2, 'CUSTOM', 'application-1', expect.any(String))
  })
})
