import {
  selectableApplicationStages,
  type ApplicationEventType,
  type ApplicationStage,
} from '../../shared/constants/stages'
import type { JobRepositories } from './jobs.service'
import type { createInterviewFlowService } from './interview-flow.service'

export type CloseReason = 'REJECTED' | 'VOLUNTARY' | 'HC_CLOSED' | 'NO_RESPONSE' | 'OFFER_DECLINED' | 'OTHER'
export interface TransitionInput {
  stage: ApplicationStage
  title: string
  type?: ApplicationEventType
  at?: string
  channel?: string
  notes?: string
  closeReason?: CloseReason
  cancelOpenInterviews?: boolean
  endOpenInterviews?: boolean
}
export interface SubmitInput {
  appliedAt: string
  resumeVersionId: string | null
  channel: string
  notes?: string
  cancelOpenInterviews?: boolean
}

export function createApplicationsService(
  repositories: JobRepositories,
  interviewFlow?: ReturnType<typeof createInterviewFlowService>,
) {
  return {
    transition(id: string, input: TransitionInput) {
      if (
        !selectableApplicationStages.includes(
          input.stage as Exclude<ApplicationStage, 'TECH_INTERVIEW' | 'HR_INTERVIEW'>,
        )
      )
        throw new Error('无效的投递阶段')
      if (input.stage === 'APPLIED') throw new Error('请通过“标记已投递”填写投递时间、简历和渠道')
      if (input.stage === 'CLOSED' && !input.closeReason) throw new Error('结束流程时必须填写结束原因')
      const current = repositories.applications.get(id) as { currentStage: ApplicationStage } | undefined
      if (!current) throw new Error('没有找到投递记录')
      if (
        interviewFlow &&
        (current.currentStage === 'INTERVIEW_PENDING' ||
          current.currentStage === 'INTERVIEW_DONE' ||
          input.stage === 'INTERVIEW_PENDING' ||
          input.stage === 'INTERVIEW_DONE')
      ) {
        return interviewFlow.transition(id, {
          stage: input.stage,
          title: input.title,
          at: input.at,
          closeReason: input.closeReason,
          cancelOpenInterviews: input.cancelOpenInterviews,
          endOpenInterviews: input.endOpenInterviews,
        })
      }
      return repositories.applications.transition(id, input)
    },
    submit(id: string, input: SubmitInput) {
      if (!input.appliedAt || !input.channel.trim()) throw new Error('请填写投递时间和投递渠道')
      return interviewFlow ? interviewFlow.submit(id, input) : repositories.applications.submit(id, input)
    },
    setResumeVersion(id: string, resumeVersionId: string | null) {
      if (!repositories.applications.get(id)) throw new Error('没有找到投递记录')
      if (resumeVersionId) {
        const resume = repositories.resumes.get(resumeVersionId) as { archivedAt?: string | null } | undefined
        if (!resume || resume.archivedAt) throw new Error('所选简历版本不可用')
      }
      if (!repositories.applications.setResumeVersion(id, resumeVersionId))
        throw new Error('没有找到投递记录')
    },
    completeStageAction(id: string, submission?: SubmitInput) {
      const application = repositories.applications.get(id) as { currentStage: ApplicationStage } | undefined
      if (!application) throw new Error('没有找到投递记录')
      if (application.currentStage === 'TO_APPLY') {
        if (!submission) throw new Error('请填写投递时间和投递渠道')
        return this.submit(id, submission)
      }
      if (application.currentStage === 'ASSESSMENT_PENDING') {
        return this.transition(id, {
          stage: 'ASSESSMENT_DONE',
          title: '测评已完成',
          type: 'ASSESSMENT_COMPLETED',
        })
      }
      if (application.currentStage === 'WRITTEN_TEST_PENDING') {
        return this.transition(id, {
          stage: 'WRITTEN_TEST_DONE',
          title: '笔试已完成',
          type: 'WRITTEN_TEST_COMPLETED',
        })
      }
      throw new Error('当前岗位没有待完成的阶段行动')
    },
    completeNextAction(id: string, completedAt = new Date().toISOString()) {
      if (!repositories.applications.get(id)) throw new Error('没有找到投递记录')
      return repositories.applications.completeNextAction(id, completedAt)
    },
    setStageNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      if (!repositories.applications.get(input.id)) throw new Error('没有找到投递记录')
      if (input.enabled && !input.notificationAt) throw new Error('请选择桌面通知时间')
      if (!repositories.applications.setStageNotification(input)) throw new Error('没有找到投递记录')
    },
    setNextActionNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      if (input.enabled && !input.notificationAt) throw new Error('请选择桌面通知时间')
      if (!repositories.applications.setNextActionNotification(input))
        throw new Error('没有待设置的自定义行动')
    },
    addEvent(
      id: string,
      input: {
        title: string
        type?: ApplicationEventType
        stage?: ApplicationStage
        at?: string
        channel?: string
        notes?: string
      },
    ) {
      if (!repositories.applications.get(id)) throw new Error('没有找到投递记录')
      return repositories.events.insert({
        applicationId: id,
        type: input.type ?? 'NOTE',
        title: input.title,
        stage: input.stage,
        eventAt: input.at,
        channel: input.channel,
        notes: input.notes,
      })
    },
    updateEvent(id: string, input: { title: string; at: string; notes?: string }) {
      if (!repositories.events.update(id, { title: input.title, eventAt: input.at, notes: input.notes }))
        throw new Error('这条记录不可编辑，或已被删除')
    },
    deleteEvent(id: string) {
      if (!repositories.events.delete(id)) throw new Error('这条记录不存在或已被删除')
    },
    setNextAction(id: string, nextAction: string | null, nextActionAt: string | null) {
      if (!repositories.applications.get(id)) throw new Error('没有找到投递记录')
      repositories.applications.setNextAction(id, nextAction, nextActionAt)
    },
    listTimeline(id: string) {
      if (!repositories.applications.get(id)) return []
      return repositories.events.listByApplication(id)
    },
  }
}
