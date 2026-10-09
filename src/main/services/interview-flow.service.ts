import type Database from 'better-sqlite3'
import type { ApplicationStage } from '../../shared/constants/stages'
import {
  createInterviewFlowRepository,
  type InterviewFlowStore,
  type ScheduleRecordInput,
} from '../repositories/interview-flow.repository'

const interviewStages = new Set<ApplicationStage>([
  'INTERVIEW_PENDING',
  'INTERVIEW_DONE',
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
])

export interface ScheduleInterviewInput extends Omit<ScheduleRecordInput, 'round' | 'roundNumber' | 'type'> {
  roundNumber: number
  type?: string
  interviewId?: string
}

export function createInterviewFlowService(db: Database.Database) {
  const repository = createInterviewFlowRepository(db)
  return {
    schedule(input: ScheduleInterviewInput) {
      validateSchedule(input)
      return repository.transaction((store) => schedule(store, input))
    },
    updateEnded(input: ScheduleInterviewInput & { interviewId: string }) {
      validateSchedule(input)
      return repository.transaction((store) => {
        const interview = store.getInterview(input.interviewId)
        if (!interview?.endedAt) throw new Error('没有找到已结束的面试记录')
        const record: ScheduleRecordInput = {
          ...input,
          round: `第 ${input.roundNumber} 面`,
          type: input.type ?? 'TECHNICAL',
        }
        store.updateSchedule(interview.id, record)
      })
    },
    complete(interviewId: string, completedAt = new Date().toISOString()) {
      return repository.transaction((store) => {
        const interview = store.getInterview(interviewId)
        if (!interview || interview.cancelledAt || interview.endedAt) throw new Error('没有找到有效面试日程')
        if (interview.completedAt) return
        if (interview.roundNumber !== null && interview.roundNumber > 1) {
          const rounds = store.listRounds(interview.applicationId)
          for (let number = 1; number < interview.roundNumber; number += 1) {
            const previous = rounds.find(
              (round) => round.roundNumber === number && !round.cancelledAt && !round.endedAt,
            )
            if (!previous?.completedAt) throw new Error(`请先完成第 ${number} 面`)
          }
        }
        store.setCompleted(interviewId, completedAt)
        if (interview.roundNumber !== null)
          store.addRoundEvent(
            interview.applicationId,
            interviewId,
            interview.roundNumber,
            interview.interviewAt,
          )
        syncApplicationStage(store, interview.applicationId)
      })
    },
    cancel(interviewId: string, cancelledAt = new Date().toISOString()) {
      return repository.transaction((store) => {
        const interview = store.getInterview(interviewId)
        if (!interview || interview.cancelledAt || interview.endedAt) return
        store.cancelInterview(interviewId, cancelledAt)
        syncApplicationStage(store, interview.applicationId)
      })
    },
    deletePast(interviewId: string, now = new Date().toISOString()) {
      return repository.transaction((store) => {
        const interview = store.getInterview(interviewId)
        if (!interview) throw new Error('没有找到对应面试')
        if (Date.parse(interview.interviewAt) >= Date.parse(now))
          throw new Error('面试尚未结束，不能删除历史记录')
        store.deleteInterview(interviewId)
        syncApplicationStage(store, interview.applicationId)
      })
    },
    submit(
      applicationId: string,
      input: {
        appliedAt: string
        resumeVersionId: string | null
        channel: string
        notes?: string
        cancelOpenInterviews?: boolean
        endOpenInterviews?: boolean
      },
    ) {
      return repository.transaction((store) => {
        const application = store.getApplication(applicationId)
        if (!application) throw new Error('没有找到投递记录')
        const state = store.roundState(applicationId)
        if (Number(state.open ?? 0) > 0 && !input.cancelOpenInterviews)
          throw new Error('此岗位有未完成的面试日程，请确认取消后再标记已投递')
        if (Number(state.open ?? 0) > 0) store.cancelOpen(applicationId, new Date().toISOString())
        store.submit(applicationId, input)
      })
    },
    transition(
      applicationId: string,
      input: {
        stage: ApplicationStage
        title: string
        at?: string
        closeReason?: string
        cancelOpenInterviews?: boolean
        endOpenInterviews?: boolean
      },
    ) {
      return repository.transaction((store) => {
        const application = store.getApplication(applicationId)
        if (!application) throw new Error('没有找到投递记录')
        if (input.stage === 'INTERVIEW_PENDING') throw new Error('请先通过面试日程安排面试，再进入面试中阶段')
        const state = store.roundState(applicationId)
        if (input.stage === 'INTERVIEW_DONE' && Number(state.completed ?? 0) === 0)
          throw new Error('请先完成至少一轮面试，再进入已面试阶段')
        if (
          interviewStages.has(application.currentStage) &&
          Number(state.open ?? 0) > 0 &&
          !input.cancelOpenInterviews &&
          !input.endOpenInterviews
        ) {
          throw new Error('此岗位有未完成的面试日程，请确认取消后再更改阶段')
        }
        const at = input.at ?? new Date().toISOString()
        if (Number(state.open ?? 0) > 0) {
          if (input.endOpenInterviews) store.endOpen(applicationId, at)
          else store.cancelOpen(applicationId, at)
        }
        store.setStage(applicationId, input.stage, null, input.closeReason ?? null)
        store.addStageEvent(applicationId, input.stage, input.title, at)
      })
    },
  }
}

function schedule(store: InterviewFlowStore, input: ScheduleInterviewInput): { id: string } {
  const application = store.getApplication(input.applicationId)
  if (!application) throw new Error('没有找到投递记录')

  const rounds = store.listRounds(input.applicationId)
  const activeNumericRounds = rounds.filter(
    (item) => item.roundNumber !== null && !item.cancelledAt && !item.endedAt,
  )
  for (let number = 1; number < input.roundNumber; number += 1) {
    const previous = activeNumericRounds.find((item) => item.roundNumber === number)
    if (!previous) throw new Error(`请先补充第 ${number} 面的面试时间`)
    if (Date.parse(previous.interviewAt) >= Date.parse(input.interviewAt))
      throw new Error(`第 ${number} 面时间必须早于第 ${input.roundNumber} 面`)
  }
  const laterRounds = activeNumericRounds.filter((item) => item.roundNumber! >= input.roundNumber!)
  const nextRound = laterRounds.find(
    (item) =>
      item.roundNumber! > input.roundNumber! && Date.parse(item.interviewAt) <= Date.parse(input.interviewAt),
  )
  if (nextRound) throw new Error(`第 ${input.roundNumber} 面时间必须早于第 ${nextRound.roundNumber} 面`)
  store.removeRoundEventsFrom(input.applicationId, input.roundNumber)
  for (const later of laterRounds) store.setCompleted(later.id, null)

  const label = `第 ${input.roundNumber} 面`
  const record: ScheduleRecordInput = { ...input, type: input.type ?? 'TECHNICAL', round: label }
  const existing = input.interviewId
    ? rounds.find((item) => item.id === input.interviewId && !item.cancelledAt)
    : activeNumericRounds.find((item) => item.roundNumber === input.roundNumber)
  if (input.interviewId && !existing) throw new Error('没有找到有效面试日程')
  if (existing && existing.roundNumber !== input.roundNumber)
    throw new Error('已安排的面试不能更改轮次，请新建正确轮次')
  const id = existing?.id ?? store.createSchedule(record)
  if (existing) store.updateSchedule(existing.id, record)

  for (const previous of activeNumericRounds.filter((item) => item.roundNumber! < input.roundNumber!)) {
    store.setCompleted(previous.id, previous.interviewAt)
    store.addRoundEvent(input.applicationId, previous.id, previous.roundNumber!, previous.interviewAt)
  }

  const returnStage = returnStageFor(application.currentStage, application.interviewReturnStage)
  store.setStage(input.applicationId, 'INTERVIEW_PENDING', returnStage)
  if (application.currentStage !== 'INTERVIEW_PENDING')
    store.addStageEvent(input.applicationId, 'INTERVIEW_PENDING', `安排${label}`, input.interviewAt)
  return { id }
}

function syncApplicationStage(store: InterviewFlowStore, applicationId: string): void {
  const application = store.getApplication(applicationId)
  if (!application) return
  const state = store.roundState(applicationId)
  const open = Number(state.open ?? 0)
  const completed = Number(state.completed ?? 0)
  if (open > 0) {
    if (application.currentStage !== 'INTERVIEW_PENDING')
      store.setStage(
        applicationId,
        'INTERVIEW_PENDING',
        application.interviewReturnStage ?? application.currentStage,
      )
    return
  }
  if (completed > 0) {
    store.setStage(applicationId, 'INTERVIEW_DONE', null)
    return
  }
  if (application.interviewReturnStage) store.setStage(applicationId, application.interviewReturnStage, null)
  else if (interviewStages.has(application.currentStage)) store.setStage(applicationId, 'APPLIED', null)
}

function returnStageFor(
  stage: ApplicationStage,
  savedStage: ApplicationStage | null,
): ApplicationStage | null {
  if (!interviewStages.has(stage)) return stage
  return savedStage ?? (stage === 'INTERVIEW_DONE' ? 'INTERVIEW_DONE' : null)
}

function validateSchedule(input: ScheduleInterviewInput): void {
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) throw new Error('面试轮次必须是正整数')
  if (!Number.isFinite(Date.parse(input.interviewAt))) throw new Error('请选择有效的面试时间')
}
