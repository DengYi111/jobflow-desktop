import type { JobRepositories } from './jobs.service'
import type { createInterviewFlowService } from './interview-flow.service'

export const defaultQuestionCategories = [
  'C语言',
  '数据结构',
  '算法',
  'STM32',
  'FreeRTOS',
  '操作系统',
  '计算机网络',
  'Linux',
  '项目',
  '行为面',
  '其他',
] as const

export function createInterviewsService(
  repositories: JobRepositories,
  flow?: ReturnType<typeof createInterviewFlowService>,
) {
  type InterviewRecord = Record<string, unknown> & { notificationEnabled: number | boolean }
  return {
    list(input: { from?: string; to?: string } = {}) {
      return (repositories.interviews.list(input) as InterviewRecord[]).map((item) => ({
        ...item,
        notificationEnabled: Boolean(item.notificationEnabled),
      }))
    },
    get(id: string) {
      const item = repositories.interviews.get(id) as InterviewRecord | undefined
      return item ? { ...item, notificationEnabled: Boolean(item.notificationEnabled) } : undefined
    },
    create(input: {
      applicationId: string
      roundNumber: number
      interviewAt: string
      type?: 'TECHNICAL' | 'HR' | 'MANAGER' | 'CROSS_FUNCTIONAL' | 'OTHER'
      durationMinutes?: number | null
      format?: string | null
      mode?: 'ONLINE' | 'OFFLINE' | null
      location?: string | null
    }) {
      if (!repositories.applications.get(input.applicationId)) throw new Error('没有找到对应投递记录')
      validateRoundNumber(input.roundNumber)
      validateModeLocation(input.mode, input.location)
      const normalized = { ...input, location: input.location?.trim() || null }
      if (flow) return flow.schedule({ ...normalized, roundNumber: input.roundNumber })
      return repositories.interviews.create({
        ...normalized,
        round: `第 ${input.roundNumber} 面`,
        type: input.type ?? 'TECHNICAL',
      })
    },
    update(input: {
      id: string
      roundNumber: number
      interviewAt: string
      type?: 'TECHNICAL' | 'HR' | 'MANAGER' | 'CROSS_FUNCTIONAL' | 'OTHER'
      durationMinutes?: number | null
      format?: string | null
      mode?: 'ONLINE' | 'OFFLINE' | null
      location?: string | null
    }) {
      validateRoundNumber(input.roundNumber)
      validateModeLocation(input.mode, input.location)
      const normalized = { ...input, location: input.location?.trim() || null }
      if (flow) {
        const existing = repositories.interviews.get(input.id) as
          { applicationId: string; endedAt: string | null } | undefined
        if (!existing) throw new Error('没有找到对应面试')
        if (existing.endedAt)
          return flow.updateEnded({
            ...normalized,
            applicationId: existing.applicationId,
            roundNumber: input.roundNumber,
            interviewId: input.id,
          })
        return flow.schedule({
          ...normalized,
          applicationId: existing.applicationId,
          roundNumber: input.roundNumber,
          interviewId: input.id,
        })
      }
      return repositories.interviews.update({ ...normalized, round: `第 ${input.roundNumber} 面` })
    },
    setNotification(input: { id: string; enabled: boolean; notificationAt: string | null }) {
      if (!repositories.interviews.get(input.id)) throw new Error('没有找到对应面试')
      repositories.interviews.setNotification(input)
    },
    complete(id: string, completedAt = new Date().toISOString()) {
      if (flow) return flow.complete(id, completedAt)
      if (!repositories.interviews.complete(id, completedAt)) throw new Error('没有找到对应面试')
    },
    delete(id: string) {
      if (flow) flow.cancel(id)
      else repositories.interviews.delete(id)
    },
    setType(id: string, type: 'TECHNICAL' | 'HR' | 'MANAGER' | 'CROSS_FUNCTIONAL' | 'OTHER') {
      if (!repositories.interviews.setType(id, type)) throw new Error('没有找到对应面试')
    },
    deletePast(id: string) {
      if (!flow) throw new Error('面试流程暂不可用')
      return flow.deletePast(id)
    },
    saveReview(input: {
      id: string
      result?: string | null
      overallPerformance?: string | null
      strengths?: string | null
      gaps?: string | null
      knowledgeGaps?: string | null
      nextPrep?: string | null
    }) {
      const { id, ...review } = input
      repositories.interviews.saveReview(id, review)
    },
    listQuestions(id: string) {
      return repositories.interviews.listQuestions(id)
    },
    listQuestionsByApplication(applicationId: string) {
      if (!repositories.applications.get(applicationId)) throw new Error('没有找到投递记录')
      return repositories.interviews.listQuestionsByApplication(applicationId)
    },
    addQuestion(input: {
      interviewId: string
      question: string
      category: string
      myAnswer?: string | null
      betterAnswer?: string | null
      notes?: string | null
    }) {
      if (!input.category.trim()) throw new Error('请选择题目分类')
      return repositories.interviews.addQuestion(input)
    },
    updateQuestion(input: {
      id: string
      question?: string
      category?: string
      myAnswer?: string | null
      betterAnswer?: string | null
      notes?: string | null
    }) {
      return repositories.interviews.updateQuestion(input)
    },
    deleteQuestion(id: string) {
      repositories.interviews.deleteQuestion(id)
    },
    searchQuestionBank(input: { query?: string; category?: string; companyId?: string; jobId?: string }) {
      return repositories.interviews.searchQuestionBank(input)
    },
  }
}

function validateModeLocation(mode?: 'ONLINE' | 'OFFLINE' | null, location?: string | null): void {
  if (!mode) {
    if (location?.trim()) throw new Error('请先选择面试形式')
    return
  }
  if (!location?.trim()) return
  if (mode === 'ONLINE') {
    let url: URL
    try {
      url = new URL(location.trim())
    } catch {
      throw new Error('请输入有效的 HTTP(S) 会议网址')
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('请输入有效的 HTTP(S) 会议网址')
  }
}

function validateRoundNumber(roundNumber: number): void {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) throw new Error('面试轮次必须是正整数')
}
