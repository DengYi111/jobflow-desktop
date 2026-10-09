export const applicationStages = [
  'TO_APPLY',
  'APPLIED',
  'ASSESSMENT_PENDING',
  'ASSESSMENT_DONE',
  'WRITTEN_TEST_PENDING',
  'WRITTEN_TEST_DONE',
  'INTERVIEW_PENDING',
  'INTERVIEW_DONE',
  // Read compatibility for historical stage events and databases.
  'TECH_INTERVIEW',
  'HR_INTERVIEW',
  'OFFER_COMMUNICATION',
  'OFFER',
  'CLOSED',
] as const

export type ApplicationStage = (typeof applicationStages)[number]

export const selectableApplicationStages = applicationStages.filter(
  (stage) => stage !== 'TECH_INTERVIEW' && stage !== 'HR_INTERVIEW',
) as readonly Exclude<ApplicationStage, 'TECH_INTERVIEW' | 'HR_INTERVIEW'>[]

export const kanbanStages = [
  'APPLIED',
  'ASSESSMENT_DONE',
  'WRITTEN_TEST_DONE',
  'INTERVIEW_PENDING',
  'INTERVIEW_DONE',
  'OFFER_COMMUNICATION',
  'OFFER',
  'CLOSED',
] as const satisfies readonly ApplicationStage[]

export const applicationEventTypes = [
  'SAVED',
  'STAGE_CHANGED',
  'APPLICATION_SUBMITTED',
  'ASSESSMENT_RECEIVED',
  'ASSESSMENT_COMPLETED',
  'WRITTEN_TEST_RECEIVED',
  'WRITTEN_TEST_COMPLETED',
  'INTERVIEW_SCHEDULED',
  'OFFER_RECEIVED',
  'CLOSED',
  'NOTE',
  'OTHER',
] as const

export type ApplicationEventType = (typeof applicationEventTypes)[number]

export const stageLabels = {
  'zh-CN': {
    TO_APPLY: '待投递',
    APPLIED: '已投递',
    ASSESSMENT_PENDING: '待测评',
    ASSESSMENT_DONE: '已测评',
    WRITTEN_TEST_PENDING: '待笔试',
    WRITTEN_TEST_DONE: '已笔试',
    INTERVIEW_PENDING: '面试中',
    INTERVIEW_DONE: '已面试',
    TECH_INTERVIEW: '技术面',
    HR_INTERVIEW: 'HR 面',
    OFFER_COMMUNICATION: '录用沟通',
    OFFER: '已获录用',
    CLOSED: '已结束',
  } satisfies Record<ApplicationStage, string>,
} as const

export const terminalStages = ['OFFER', 'CLOSED'] as const satisfies readonly ApplicationStage[]
