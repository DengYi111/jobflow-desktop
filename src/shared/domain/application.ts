import type { ApplicationStage } from '../constants/stages'

export interface Application {
  id: string
  jobId: string
  currentStage: ApplicationStage
  priority: 1 | 2 | 3
  pinned: boolean
  resumeVersionId: string | null
  appliedAt: string | null
  nextAction: string | null
  nextActionAt: string | null
  createdAt: string
  updatedAt: string
}
