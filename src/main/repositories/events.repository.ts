import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ApplicationEventType, ApplicationStage } from '../../shared/constants/stages'

const now = () => new Date().toISOString()

export interface EventInput {
  applicationId: string
  type: ApplicationEventType
  title: string
  stage?: ApplicationStage | null
  channel?: string | null
  eventAt?: string
  notes?: string | null
}
export function createEventsRepository(db: Database.Database) {
  return {
    insert(input: EventInput) {
      const event = {
        id: randomUUID(),
        ...input,
        stage: input.stage ?? null,
        channel: input.channel ?? null,
        eventAt: input.eventAt ?? new Date().toISOString(),
        notes: input.notes ?? null,
        createdAt: new Date().toISOString(),
      }
      db.prepare(
        'INSERT INTO application_events(id,application_id,type,title,stage,channel,event_at,notes,created_at) VALUES (@id,@applicationId,@type,@title,@stage,@channel,@eventAt,@notes,@createdAt)',
      ).run(event)
      return event
    },
    listByApplication(applicationId: string) {
      return db
        .prepare(
          'SELECT e.id,e.application_id AS applicationId,e.type,e.title,e.stage,e.channel,e.event_at AS eventAt,e.notes,e.interview_id AS interviewId,e.interview_round_number AS interviewRoundNumber,i.type AS interviewType,e.created_at AS createdAt FROM application_events e LEFT JOIN interviews i ON i.id=e.interview_id WHERE e.application_id=? ORDER BY e.event_at ASC,e.created_at ASC',
        )
        .all(applicationId)
    },
    update(id: string, input: Pick<EventInput, 'title' | 'eventAt' | 'notes'>) {
      const event = db
        .prepare('SELECT interview_id AS interviewId FROM application_events WHERE id=?')
        .get(id) as { interviewId: string | null } | undefined
      if (!event) return false
      return db.transaction(() => {
        const result = db
          .prepare('UPDATE application_events SET title=@title,event_at=@eventAt,notes=@notes WHERE id=@id')
          .run({ id, ...input, notes: input.notes ?? null })
        if (event.interviewId)
          db.prepare(
            'UPDATE interviews SET interview_at=?,completed_at=CASE WHEN completed_at IS NULL THEN NULL ELSE ? END,updated_at=? WHERE id=?',
          ).run(input.eventAt, input.eventAt, now(), event.interviewId)
        return result.changes > 0
      })()
    },
    delete(id: string) {
      return db.prepare('DELETE FROM application_events WHERE id=?').run(id).changes > 0
    },
  }
}
