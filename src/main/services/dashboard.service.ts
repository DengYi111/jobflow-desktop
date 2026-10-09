import type Database from 'better-sqlite3'
import type { JobRepositories } from './jobs.service'
import { createRemindersService } from './reminders.service'
import { applicationStages } from '../../shared/constants/stages'

export function createDashboardService(db: Database.Database, repositories: JobRepositories) {
  const reminders = createRemindersService(repositories)
  return {
    getNotificationsEnabled() {
      const row = db.prepare("SELECT value FROM app_settings WHERE key='notifications_enabled'").get() as
        { value: string } | undefined
      return row ? row.value === 'true' : true
    },
    setNotificationsEnabled(enabled: boolean) {
      db.prepare(
        "INSERT INTO app_settings(key,value,updated_at) VALUES ('notifications_enabled',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      ).run(String(enabled), new Date().toISOString())
    },
    getSummary(now = new Date()) {
      const todayEnd = new Date(now)
      todayEnd.setHours(23, 59, 59, 999)
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() + 7)
      const dueItems = reminders.listDue({ to: todayEnd.toISOString() })
      const makeStageLane = (stage: 'TO_APPLY' | 'ASSESSMENT_PENDING' | 'WRITTEN_TEST_PENDING') => {
        const items = db
          .prepare(
            `SELECT a.id AS applicationId,a.current_stage AS stage,a.stage_notification_enabled=1 AS notificationEnabled,a.stage_notification_at AS notificationAt,
          j.id AS jobId,j.title AS jobTitle,c.name AS companyName,
          COALESCE((SELECT url FROM job_listings WHERE job_id=j.id AND is_primary=1 AND url IS NOT NULL ORDER BY captured_at DESC LIMIT 1),
            (SELECT url FROM job_listings WHERE job_id=j.id AND url IS NOT NULL ORDER BY captured_at DESC,created_at DESC LIMIT 1)) AS postingUrl
          FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
          WHERE a.current_stage=? AND j.deleted_at IS NULL
          ORDER BY COALESCE(a.stage_notification_at,a.updated_at),c.name,j.title`,
          )
          .all(stage)
        return { key: stage, count: items.length, items }
      }
      const stageActionLanes = [
        makeStageLane('TO_APPLY'),
        makeStageLane('ASSESSMENT_PENDING'),
        makeStageLane('WRITTEN_TEST_PENDING'),
      ]
      const interviewActionItems = db
        .prepare(
          `SELECT i.id AS interviewId,i.application_id AS applicationId,i.round,i.round_number AS roundNumber,i.type,i.interview_at AS interviewAt,
          i.notification_enabled=1 AS notificationEnabled,i.notification_at AS notificationAt,
          j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM interviews i JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE i.completed_at IS NULL AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND j.deleted_at IS NULL
        ORDER BY i.interview_at,i.created_at`,
        )
        .all()
      const customActionItems = db
        .prepare(
          `SELECT a.id AS applicationId,a.next_action AS nextAction,a.next_action_at AS nextActionAt,
          a.next_action_notification_enabled=1 AS notificationEnabled,a.next_action_notification_at AS notificationAt,
          j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE a.next_action IS NOT NULL AND length(trim(a.next_action))>0 AND j.deleted_at IS NULL
        ORDER BY COALESCE(a.next_action_at,a.updated_at),c.name,j.title`,
        )
        .all()
      const actionLanes = [
        ...stageActionLanes,
        { key: 'INTERVIEW', count: interviewActionItems.length, items: interviewActionItems },
        { key: 'CUSTOM', count: customActionItems.length, items: customActionItems },
      ]
      const upcomingInterviews = db
        .prepare(
          `SELECT i.id,i.application_id AS applicationId,i.round,i.type,i.interview_at AS interviewAt,i.notification_enabled=1 AS notificationEnabled,i.notification_at AS notificationAt,j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM interviews i JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE i.completed_at IS NULL AND i.cancelled_at IS NULL AND i.ended_at IS NULL AND i.interview_at>=? AND i.interview_at<=? AND j.deleted_at IS NULL ORDER BY i.interview_at LIMIT 8`,
        )
        .all(now.toISOString(), weekEnd.toISOString())
      const stageRows = db
        .prepare(
          'SELECT a.current_stage AS stage,count(*) AS count FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.deleted_at IS NULL GROUP BY a.current_stage',
        )
        .all() as Array<{ stage: string; count: number }>
      const stageCounts = Object.fromEntries(applicationStages.map((stage) => [stage, 0])) as Record<
        (typeof applicationStages)[number],
        number
      >
      for (const row of stageRows)
        if (row.stage in stageCounts) stageCounts[row.stage as keyof typeof stageCounts] = row.count
      const nextActions = customActionItems
      const recentEvents = db
        .prepare(
          `SELECT e.id,e.type,e.title,e.stage,e.event_at AS eventAt,e.channel,e.notes,a.id AS applicationId,j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM application_events e JOIN applications a ON a.id=e.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE j.deleted_at IS NULL ORDER BY e.event_at DESC,e.created_at DESC LIMIT 8`,
        )
        .all()
      const activeCount = Object.entries(stageCounts)
        .filter(([stage]) => stage !== 'OFFER' && stage !== 'CLOSED')
        .reduce((sum, [, count]) => sum + count, 0)
      return {
        dueItems,
        dueCount: dueItems.length,
        upcomingInterviews,
        upcomingInterviewCount: upcomingInterviews.length,
        stageCounts,
        activeCount,
        actionLanes,
        nextActions,
        recentEvents,
      }
    },
  }
}
