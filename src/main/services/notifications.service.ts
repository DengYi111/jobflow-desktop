export type DesktopNotificationKind = 'STAGE' | 'CUSTOM' | 'INTERVIEW'

export interface DesktopNotificationItem {
  id: string
  kind: DesktopNotificationKind
  title: string
  body: string
  companyName: string
  jobTitle: string
  notificationAt: string
  jobId: string
}

export function createNotificationScheduler(options: {
  isEnabled?: () => boolean
  findDue: (now: string) => DesktopNotificationItem[]
  notify: (item: DesktopNotificationItem) => void | Promise<void>
  markSent: (kind: DesktopNotificationKind, id: string, sentAt: string) => void
  now?: () => Date
  intervalMs?: number
  onError?: (error: unknown) => void
}) {
  const now = options.now ?? (() => new Date())
  const intervalMs = options.intervalMs ?? 30_000
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  const runOnce = async () => {
    if (running || options.isEnabled?.() === false) return
    running = true
    const sentAt = now().toISOString()
    try {
      for (const item of options.findDue(sentAt)) {
        try {
          await options.notify(item)
          options.markSent(item.kind, item.id, sentAt)
        } catch (error) {
          options.onError?.(error)
        }
      }
    } catch (error) {
      options.onError?.(error)
    } finally {
      running = false
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return
      void runOnce()
      timer = setInterval(() => {
        void runOnce()
      }, intervalMs)
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = undefined
    },
  }
}
