const pad = (value: number) => String(value).padStart(2, '0')

export function formatLocalDateTime(instant: string): string {
  const date = new Date(instant)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function isBeforeLocalToday(instant: string, now = new Date()): boolean {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return new Date(instant).getTime() < startOfToday.getTime()
}
