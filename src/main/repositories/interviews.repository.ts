import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export interface InterviewInput {
  applicationId: string
  type: 'TECHNICAL' | 'HR' | 'MANAGER' | 'CROSS_FUNCTIONAL' | 'OTHER'
  round: string
  interviewAt: string
  durationMinutes?: number | null
  format?: string | null
  mode?: 'ONLINE' | 'OFFLINE' | null
  location?: string | null
}
export function createInterviewsRepository(db: Database.Database) {
  return {
    create(input: InterviewInput) {
      const now = new Date().toISOString()
      const interview = {
        id: randomUUID(),
        ...input,
        durationMinutes: input.durationMinutes ?? null,
        format: input.format ?? null,
        mode: input.mode ?? null,
        location: input.location ?? null,
        createdAt: now,
        updatedAt: now,
      }
      db.prepare(
        'INSERT INTO interviews(id,application_id,type,round,interview_at,duration_minutes,format,mode,location,created_at,updated_at) VALUES (@id,@applicationId,@type,@round,@interviewAt,@durationMinutes,@format,@mode,@location,@createdAt,@updatedAt)',
      ).run(interview)
      return { ...interview, notificationEnabled: false, notificationAt: null, completedAt: null }
    },
    list(input: { from?: string; to?: string } = {}) {
      const where: string[] = ['j.deleted_at IS NULL']
      const params: Record<string, string> = {}
      if (input.from) {
        where.push('i.interview_at >= @from')
        params.from = input.from
      }
      if (input.to) {
        where.push('i.interview_at <= @to')
        params.to = input.to
      }
      return db
        .prepare(
          `SELECT i.id,i.application_id AS applicationId,i.type,i.round,i.round_number AS roundNumber,i.cancelled_at AS cancelledAt,i.ended_at AS endedAt,i.interview_at AS interviewAt,i.duration_minutes AS durationMinutes,i.format,i.mode,i.location,i.result,i.overall_performance AS overallPerformance,i.strengths,i.gaps,i.knowledge_gaps AS knowledgeGaps,i.next_prep AS nextPrep,i.notification_enabled=1 AS notificationEnabled,i.notification_at AS notificationAt,i.completed_at AS completedAt,i.created_at AS createdAt,i.updated_at AS updatedAt,
        a.current_stage AS stage,a.job_id AS jobId,j.title AS jobTitle,c.id AS companyId,c.name AS companyName
        FROM interviews i JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.interview_at ASC,i.created_at ASC`,
        )
        .all(params)
    },
    get(id: string) {
      return db
        .prepare(
          `SELECT i.id,i.application_id AS applicationId,i.type,i.round,i.round_number AS roundNumber,i.cancelled_at AS cancelledAt,i.ended_at AS endedAt,i.interview_at AS interviewAt,i.duration_minutes AS durationMinutes,i.format,i.mode,i.location,i.result,i.overall_performance AS overallPerformance,i.strengths,i.gaps,i.knowledge_gaps AS knowledgeGaps,i.next_prep AS nextPrep,i.notification_enabled=1 AS notificationEnabled,i.notification_at AS notificationAt,i.completed_at AS completedAt,i.created_at AS createdAt,i.updated_at AS updatedAt,
        a.current_stage AS stage,a.job_id AS jobId,j.title AS jobTitle,c.id AS companyId,c.name AS companyName
        FROM interviews i JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE i.id=?`,
        )
        .get(id)
    },
    update(input: {
      id: string
      round: string
      interviewAt: string
      type?: InterviewInput['type']
      durationMinutes?: number | null
      format?: string | null
      mode?: 'ONLINE' | 'OFFLINE' | null
      location?: string | null
    }) {
      db.prepare(
        `UPDATE interviews SET round=@round,interview_at=@interviewAt,type=COALESCE(@type,type),duration_minutes=@durationMinutes,mode=@mode,location=@location,updated_at=@updatedAt WHERE id=@id`,
      ).run({
        ...input,
        type: input.type ?? null,
        durationMinutes: input.durationMinutes ?? null,
        mode: input.mode ?? null,
        location: input.location ?? null,
        updatedAt: new Date().toISOString(),
      })
      return this.get(input.id)
    },
    delete(id: string) {
      db.prepare('DELETE FROM interviews WHERE id=?').run(id)
    },
    complete(id: string, completedAt: string) {
      return (
        db
          .prepare('UPDATE interviews SET completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=?')
          .run(completedAt, completedAt, id).changes > 0
      )
    },
    setNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      return (
        db
          .prepare(
            `UPDATE interviews SET notification_sent_at=CASE WHEN notification_enabled<>@enabled OR notification_at IS NOT @notificationAt THEN NULL ELSE notification_sent_at END,
        notification_enabled=@enabled,notification_at=@notificationAt,updated_at=@updatedAt WHERE id=@id`,
          )
          .run({ ...input, enabled: input.enabled ? 1 : 0, updatedAt: new Date().toISOString() }).changes > 0
      )
    },
    setType(id: string, type: InterviewInput['type']) {
      return (
        db
          .prepare('UPDATE interviews SET type=?,updated_at=? WHERE id=?')
          .run(type, new Date().toISOString(), id).changes > 0
      )
    },
    listDueNotifications(now: string) {
      return db
        .prepare(
          `SELECT i.id,i.round,i.interview_at AS interviewAt,i.notification_at AS notificationAt,j.id AS jobId,j.title AS jobTitle,c.name AS companyName
        FROM interviews i JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        WHERE i.notification_enabled=1 AND i.notification_at IS NOT NULL AND i.notification_at<=? AND i.notification_sent_at IS NULL AND i.interview_at>=? AND i.completed_at IS NULL AND i.cancelled_at IS NULL AND i.ended_at IS NULL
        AND j.deleted_at IS NULL ORDER BY i.notification_at ASC`,
        )
        .all(now, now)
    },
    markNotificationSent(id: string, sentAt: string) {
      db.prepare(
        'UPDATE interviews SET notification_sent_at=? WHERE id=? AND notification_sent_at IS NULL',
      ).run(sentAt, id)
    },
    listQuestions(interviewId: string) {
      return db
        .prepare(
          'SELECT id,interview_id AS interviewId,question,category,my_answer AS myAnswer,better_answer AS betterAnswer,notes,created_at AS createdAt,updated_at AS updatedAt FROM interview_questions WHERE interview_id=? ORDER BY created_at',
        )
        .all(interviewId)
    },
    listQuestionsByApplication(applicationId: string) {
      return db
        .prepare(
          `SELECT q.id,q.interview_id AS interviewId,q.question,q.category,q.my_answer AS myAnswer,q.better_answer AS betterAnswer,q.notes,q.created_at AS createdAt,q.updated_at AS updatedAt,
          i.round,i.round_number AS roundNumber,i.type,i.interview_at AS interviewAt,i.completed_at AS completedAt,i.cancelled_at AS cancelledAt
          FROM interview_questions q JOIN interviews i ON i.id=q.interview_id
          WHERE i.application_id=? ORDER BY i.round_number,i.interview_at,i.created_at,q.created_at`,
        )
        .all(applicationId)
    },
    addQuestion(input: {
      interviewId: string
      question: string
      category: string
      myAnswer?: string | null
      betterAnswer?: string | null
      notes?: string | null
    }) {
      const now = new Date().toISOString()
      const item = {
        id: randomUUID(),
        ...input,
        myAnswer: input.myAnswer ?? null,
        betterAnswer: input.betterAnswer ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      }
      db.prepare(
        'INSERT INTO interview_questions(id,interview_id,question,category,my_answer,better_answer,notes,created_at,updated_at) VALUES (@id,@interviewId,@question,@category,@myAnswer,@betterAnswer,@notes,@createdAt,@updatedAt)',
      ).run(item)
      return item
    },
    updateQuestion(input: {
      id: string
      question?: string
      category?: string
      myAnswer?: string | null
      betterAnswer?: string | null
      notes?: string | null
    }) {
      const columns = {
        question: 'question',
        category: 'category',
        myAnswer: 'my_answer',
        betterAnswer: 'better_answer',
        notes: 'notes',
      } as const
      const params: Record<string, unknown> = { id: input.id, updatedAt: new Date().toISOString() }
      const assignments = ['updated_at=@updatedAt']
      for (const key of Object.keys(columns) as (keyof typeof columns)[])
        if (key in input && input[key] !== undefined) {
          assignments.push(`${columns[key]}=@${key}`)
          params[key] = input[key]
        }
      db.prepare(`UPDATE interview_questions SET ${assignments.join(',')} WHERE id=@id`).run(params)
      return db
        .prepare(
          'SELECT id,interview_id AS interviewId,question,category,my_answer AS myAnswer,better_answer AS betterAnswer,notes,created_at AS createdAt,updated_at AS updatedAt FROM interview_questions WHERE id=?',
        )
        .get(input.id)
    },
    deleteQuestion(id: string) {
      db.prepare('DELETE FROM interview_questions WHERE id=?').run(id)
    },
    searchQuestionBank(input: { query?: string; category?: string; companyId?: string; jobId?: string }) {
      const where: string[] = ['j.deleted_at IS NULL']
      const params: Record<string, string> = {}
      if (input.category) {
        where.push('q.category=@category')
        params.category = input.category
      }
      if (input.companyId) {
        where.push('c.id=@companyId')
        params.companyId = input.companyId
      }
      if (input.jobId) {
        where.push('j.id=@jobId')
        params.jobId = input.jobId
      }
      const rows = db
        .prepare(
          `SELECT q.id,q.interview_id AS interviewId,q.question,q.category,q.my_answer AS myAnswer,q.better_answer AS betterAnswer,q.notes,q.created_at AS createdAt,
        i.round,i.interview_at AS interviewAt,a.id AS applicationId,j.id AS jobId,j.title AS jobTitle,c.id AS companyId,c.name AS companyName
        FROM interview_questions q JOIN interviews i ON i.id=q.interview_id JOIN applications a ON a.id=i.application_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY q.created_at DESC`,
        )
        .all(params) as Array<Record<string, unknown> & { question: string }>
      const query = normalizeQuestion(input.query ?? '')
      const groups = new Map<string, Array<Record<string, unknown>>>()
      for (const row of rows) {
        const normalizedQuestion = normalizeQuestion(row.question)
        if (!normalizedQuestion || (query && !normalizedQuestion.includes(query))) continue
        const group = groups.get(normalizedQuestion) ?? []
        group.push(row)
        groups.set(normalizedQuestion, group)
      }
      return [...groups].map(([normalizedQuestion, occurrences]) => ({
        ...occurrences[0],
        normalizedQuestion,
        occurrenceCount: occurrences.length,
        occurrences,
      }))
    },
    saveReview(
      id: string,
      review: {
        result?: string | null
        overallPerformance?: string | null
        strengths?: string | null
        gaps?: string | null
        knowledgeGaps?: string | null
        nextPrep?: string | null
      },
    ) {
      const columns = {
        result: 'result',
        overallPerformance: 'overall_performance',
        strengths: 'strengths',
        gaps: 'gaps',
        knowledgeGaps: 'knowledge_gaps',
        nextPrep: 'next_prep',
      } as const
      const assignments = Object.entries(review)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => `${columns[key as keyof typeof columns]}=@${key}`)
      if (!assignments.length) return
      const values = Object.fromEntries(Object.entries(review).filter(([, value]) => value !== undefined))
      db.prepare(`UPDATE interviews SET ${assignments.join(',')},updated_at=@updatedAt WHERE id=@id`).run({
        ...values,
        id,
        updatedAt: new Date().toISOString(),
      })
    },
  }
}

export function normalizeQuestion(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').trim().replace(/\s+/gu, ' ')
}
