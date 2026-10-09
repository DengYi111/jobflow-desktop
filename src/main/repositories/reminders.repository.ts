import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export function createRemindersRepository(db: Database.Database) {
  return {
    create(input: { applicationId: string; title: string; remindAt: string }) {
      const item = { id: randomUUID(), ...input, createdAt: new Date().toISOString() }
      db.prepare(
        'INSERT INTO reminders(id,application_id,title,remind_at,created_at) VALUES (@id,@applicationId,@title,@remindAt,@createdAt)',
      ).run(item)
      return item
    },
    complete(id: string) {
      db.prepare('UPDATE reminders SET completed_at=? WHERE id=?').run(new Date().toISOString(), id)
    },
    listDue(until: string, from = '0000-01-01T00:00:00.000Z') {
      return db
        .prepare(
          `SELECT r.id,r.application_id AS applicationId,r.title,r.remind_at AS remindAt,r.completed_at AS completedAt,j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM reminders r JOIN applications a ON a.id=r.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE r.completed_at IS NULL AND j.deleted_at IS NULL AND r.remind_at>=? AND r.remind_at<=? ORDER BY r.remind_at,r.id`,
        )
        .all(from, until)
    },
  }
}
