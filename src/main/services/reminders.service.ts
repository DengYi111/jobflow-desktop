import type { JobRepositories } from './jobs.service'

export interface ReminderInput {
  applicationId: string
  title: string
  remindAt: string
}
export function createRemindersService(repositories: JobRepositories) {
  return {
    create(input: ReminderInput) {
      if (!repositories.applications.get(input.applicationId)) throw new Error('没有找到投递记录')
      if (!input.title.trim()) throw new Error('请填写提醒内容')
      return repositories.reminders.create({ ...input, title: input.title.trim() })
    },
    complete(id: string) {
      repositories.reminders.complete(id)
    },
    listDue(range: { from?: string; to?: string } = {}) {
      const from = range.from ?? '0000-01-01T00:00:00.000Z'
      const to = range.to ?? new Date().toISOString()
      return (
        repositories.reminders.listDue(to, from) as Array<{
          id: string
          applicationId: string
          title: string
          remindAt: string
          jobId: string
          jobTitle: string
          companyName: string
        }>
      ).map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        title: row.title,
        dueAt: row.remindAt,
        remindAt: row.remindAt,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        companyName: row.companyName,
      }))
    },
  }
}
