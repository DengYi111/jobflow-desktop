import type { z } from 'zod'
import type { ApplicationEventType, ApplicationStage } from '../constants/stages'
import type { InterviewType } from '../constants/interview-types'
import type {
  addListingInputSchema,
  browserAutofillMappingSchema,
  browserBoundsSchema,
  browserCaptureJobInputSchema,
  browserClipboardSchema,
  browserFillFieldsSchema,
  browserFillFocusedFieldSchema,
  browserHistoryLimitSchema,
  browserHostnameSchema,
  browserInspectFormSchema,
  browserInputSchema,
  browserNavigateInputSchema,
  browserSiteInputSchema,
  browserTabIdSchema,
  browserUploadResumeSchema,
  companyCreateInputSchema,
  companyDirectoryImportInputSchema,
  companyDirectoryListInputSchema,
  companyListInputSchema,
  companyUpdateInputSchema,
  customFieldInputSchema,
  dateRangeInputSchema,
  educationInputSchema,
  entityIdInputSchema,
  externalLinkInputSchema,
  interviewCreateInputSchema,
  interviewNotificationInputSchema,
  interviewQuestionInputSchema,
  interviewQuestionUpdateInputSchema,
  interviewReviewInputSchema,
  interviewUpdateInputSchema,
  internshipInputSchema,
  jobCreateInputSchema,
  jobDuplicateInputSchema,
  jobUpdateInputSchema,
  jobsListInputSchema,
  projectInputSchema,
  questionBankSearchInputSchema,
  reminderCreateInputSchema,
  resumeImportInputSchema,
  updateListingInputSchema,
} from '../schemas/common'
export {
  companyDirectoryImportInputSchema,
  companyDirectoryListInputSchema,
  jobsListInputSchema,
} from '../schemas/common'

export const jobflowDomains = [
  'dashboard',
  'companies',
  'jobs',
  'applications',
  'reminders',
  'interviews',
  'profile',
  'resumes',
  'settings',
  'backup',
  'links',
  'browser',
] as const
export type JobFlowDomain = (typeof jobflowDomains)[number]
export type JobFlowChange = {
  domain: 'companies' | 'jobs' | 'applications' | 'interviews' | 'profile'
  entityId?: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; messageZh: string }
export type JobsListInput = z.input<typeof jobsListInputSchema>
export type EntityIdInput = z.infer<typeof entityIdInputSchema>
export type DateRangeInput = z.infer<typeof dateRangeInputSchema>
export type CompanyListInput = z.input<typeof companyListInputSchema>
export type CompanyDirectoryListInput = z.input<typeof companyDirectoryListInputSchema>
export type CompanyDirectoryImportInput = z.input<typeof companyDirectoryImportInputSchema>
export type CompanyCreateInput = z.input<typeof companyCreateInputSchema>
export type CompanyUpdateInput = z.input<typeof companyUpdateInputSchema>
export type ReminderCreateInput = z.infer<typeof reminderCreateInputSchema>
export type InterviewCreateInput = z.infer<typeof interviewCreateInputSchema>
export type InterviewUpdateInput = z.infer<typeof interviewUpdateInputSchema>
export type InterviewNotificationInput = z.infer<typeof interviewNotificationInputSchema>
export type InterviewReviewInput = z.infer<typeof interviewReviewInputSchema>
export type InterviewQuestionInput = z.infer<typeof interviewQuestionInputSchema>
export type InterviewQuestionUpdateInput = z.infer<typeof interviewQuestionUpdateInputSchema>
export type QuestionBankSearchInput = z.infer<typeof questionBankSearchInputSchema>
export type EducationInput = z.infer<typeof educationInputSchema>
export type InternshipInput = z.infer<typeof internshipInputSchema>
export type ProjectInput = z.infer<typeof projectInputSchema>
export type CustomFieldInput = z.infer<typeof customFieldInputSchema>
export type ResumeImportInput = z.infer<typeof resumeImportInputSchema>
export type JobCreateInput = z.input<typeof jobCreateInputSchema>
export type JobUpdateInput = z.input<typeof jobUpdateInputSchema>
export type JobDuplicateInput = z.input<typeof jobDuplicateInputSchema>
export type AddListingInput = z.input<typeof addListingInputSchema>
export type UpdateListingInput = z.input<typeof updateListingInputSchema>
export type ExternalLinkInput = z.input<typeof externalLinkInputSchema>
export type BrowserBounds = z.input<typeof browserBoundsSchema>
export type BrowserTabId = z.input<typeof browserTabIdSchema>
export type BrowserInput = z.input<typeof browserInputSchema>
export type BrowserSiteInput = z.input<typeof browserSiteInputSchema>
export type BrowserHistoryLimit = z.input<typeof browserHistoryLimitSchema>
export type BrowserNavigateInput = z.input<typeof browserNavigateInputSchema>
export type BrowserHostnameInput = z.input<typeof browserHostnameSchema>
export type BrowserInspectFormInput = z.input<typeof browserInspectFormSchema>
export type BrowserAutofillMappingInput = z.input<typeof browserAutofillMappingSchema>
export type BrowserCaptureJobInput = z.input<typeof browserCaptureJobInputSchema>
export type BrowserFillFieldsInput = z.input<typeof browserFillFieldsSchema>
export type BrowserUploadResumeInput = z.input<typeof browserUploadResumeSchema>
export type BrowserClipboardInput = z.input<typeof browserClipboardSchema>
export type BrowserFillFocusedFieldInput = z.input<typeof browserFillFocusedFieldSchema>
export type CloseReason = 'REJECTED' | 'VOLUNTARY' | 'HC_CLOSED' | 'NO_RESPONSE' | 'OFFER_DECLINED' | 'OTHER'
export type ApplicationTransitionInput = {
  id: string
  stage: ApplicationStage
  event?: ApplicationEventType
  at?: string
  notes?: string
  channel?: string
  closeReason?: CloseReason
  cancelOpenInterviews?: boolean
  endOpenInterviews?: boolean
}
export type ApplicationSubmitInput = {
  id: string
  appliedAt: string
  resumeVersionId: string | null
  channel: string
  notes?: string
  cancelOpenInterviews?: boolean
}
export type ApplicationActionCompletionInput = {
  id: string
  appliedAt?: string
  resumeVersionId?: string | null
  channel?: string
  notes?: string
}
export type ApplicationEventInput = {
  id: string
  title: string
  type?: ApplicationEventType
  stage?: ApplicationStage
  at?: string
  channel?: string
  notes?: string
}
export type ApplicationEventUpdateInput = {
  id: string
  title: string
  at: string
  notes?: string
}
export type NextActionInput = { id: string; nextAction: string | null; nextActionAt: string | null }
export type ProfileInput = Record<string, string | null>

export interface JobSummary {
  id: string
  applicationId: string
  companyId: string
  companyName: string
  title: string
  city: string | null
  stage: ApplicationStage
  priority: 1 | 2 | 3
  pinned: boolean | number
  nextAction: string | null
  nextActionAt: string | null
  deadline: string | null
  appliedAt: string | null
  updatedAt: string
  deletedAt?: string | null
  tags?: string | null
  primaryListingUrl?: string | null
  currentInterview?: {
    id: string
    roundNumber: number | null
    round: string
    type: InterviewType
    interviewAt: string
  } | null
}
export interface CompanySummary {
  id: string
  name: string
  careersUrl: string | null
  website: string | null
  industryId?: string | null
  directoryId?: string | null
  archivedAt?: string | null
}
export interface CompanyDirectorySummary {
  id: string
  name: string
  aliases: string[]
  industryId: string
  industryName: string
  localCompany: CompanySummary | null
}
export interface CompanyDirectoryResult {
  industries: Array<{ id: string; nameZh: string }>
  companies: CompanyDirectorySummary[]
}
export interface DueItem {
  id: string
  title: string
  dueAt: string
  jobId: string
  jobTitle: string
}
export interface DashboardInterview {
  id: string
  jobId: string
  jobTitle: string
  companyName: string
  round: string
  interviewAt: string
  notificationEnabled: boolean
  notificationAt: string | null
}
export interface DashboardNextAction {
  applicationId: string
  jobId: string
  jobTitle: string
  companyName: string
  nextAction: string
  nextActionAt: string
}
export type DashboardActionLaneKey =
  'TO_APPLY' | 'ASSESSMENT_PENDING' | 'WRITTEN_TEST_PENDING' | 'INTERVIEW' | 'CUSTOM'
export interface DashboardActionItem {
  applicationId: string
  interviewId?: string
  jobId: string
  jobTitle: string
  companyName: string
  postingUrl?: string | null
  stage?: ApplicationStage
  nextAction?: string | null
  nextActionAt?: string | null
  interviewAt?: string
  round?: string
  roundNumber?: number | null
  type?: InterviewType
  notificationEnabled: boolean | number
  notificationAt: string | null
}
export interface DashboardActionLane {
  key: DashboardActionLaneKey
  count: number
  items: DashboardActionItem[]
}
export interface BrowserTab {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}
export interface BrowserState {
  tabs: BrowserTab[]
  activeTabId: string | null
}
export interface BrowserPageCapture {
  title: string
  url: string
  text: string
}
export interface BrowserFormField {
  index: number
  indices?: number[]
  tag: string
  type: string
  kind?: 'text' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'file'
  role?: string
  label: string
  context?: string
  group?: string
  autocomplete?: string
  name?: string
  id?: string
  placeholder?: string
  ariaLabel?: string
  options?: Array<{ label: string; value: string; checked?: boolean }>
  signature: string
  profileField?: string
}
export interface SettingsInfo {
  dataDirectory: string
  version: string
}

export interface JobFlowApi {
  dashboard: {
    getSummary(): Promise<
      ApiResult<{
        activeCount: number
        upcomingInterviewCount: number
        upcomingInterviews: DashboardInterview[]
        actionLanes: DashboardActionLane[]
        nextActions: DashboardNextAction[]
      }>
    >
    listDueItems(range?: DateRangeInput): Promise<ApiResult<DueItem[]>>
    getNotificationsEnabled(): Promise<ApiResult<boolean>>
    setNotificationsEnabled(input: { enabled: boolean }): Promise<ApiResult<void>>
  }
  companies: {
    list(input?: CompanyListInput): Promise<ApiResult<CompanySummary[]>>
    listDirectory(input?: CompanyDirectoryListInput): Promise<ApiResult<CompanyDirectoryResult>>
    addFromDirectory(input: CompanyDirectoryImportInput): Promise<ApiResult<CompanySummary>>
    create(input: CompanyCreateInput): Promise<ApiResult<CompanySummary>>
    update(input: CompanyUpdateInput): Promise<ApiResult<CompanySummary>>
    get(input: EntityIdInput): Promise<ApiResult<unknown | null>>
    archive(input: EntityIdInput): Promise<ApiResult<void>>
  }
  jobs: {
    list(input?: JobsListInput): Promise<ApiResult<{ items: JobSummary[]; total: number }>>
    get(input: EntityIdInput): Promise<ApiResult<unknown | null>>
    create(
      input: JobCreateInput,
    ): Promise<ApiResult<{ id: string; applicationId: string; duplicateAccepted: boolean }>>
    update(input: JobUpdateInput): Promise<ApiResult<unknown | null>>
    softDelete(input: EntityIdInput): Promise<ApiResult<void>>
    restore(input: EntityIdInput): Promise<ApiResult<void>>
    permanentlyDelete(input: EntityIdInput & { confirm: true }): Promise<ApiResult<void>>
    clearTrash(input: { confirm: true }): Promise<ApiResult<number>>
    findDuplicates(input: JobDuplicateInput): Promise<ApiResult<JobSummary[]>>
    addListing(input: AddListingInput): Promise<ApiResult<unknown>>
    updateListing(input: UpdateListingInput): Promise<ApiResult<unknown>>
  }
  applications: {
    transition(input: ApplicationTransitionInput): Promise<ApiResult<void>>
    submit(input: ApplicationSubmitInput): Promise<ApiResult<void>>
    setResumeVersion(input: { id: string; resumeVersionId: string | null }): Promise<ApiResult<void>>
    completeStageAction(input: ApplicationActionCompletionInput): Promise<ApiResult<void>>
    completeNextAction(input: EntityIdInput): Promise<ApiResult<void>>
    setStageNotification(input: InterviewNotificationInput): Promise<ApiResult<void>>
    setNextActionNotification(input: InterviewNotificationInput): Promise<ApiResult<void>>
    addEvent(input: ApplicationEventInput): Promise<ApiResult<void>>
    updateEvent(input: ApplicationEventUpdateInput): Promise<ApiResult<void>>
    deleteEvent(input: EntityIdInput): Promise<ApiResult<void>>
    setNextAction(input: NextActionInput): Promise<ApiResult<void>>
    listTimeline(input: EntityIdInput): Promise<ApiResult<unknown[]>>
  }
  reminders: {
    create(input: ReminderCreateInput): Promise<ApiResult<{ id: string }>>
    complete(input: EntityIdInput): Promise<ApiResult<void>>
    listDue(input?: DateRangeInput): Promise<ApiResult<DueItem[]>>
  }
  interviews: {
    list(input?: DateRangeInput): Promise<ApiResult<unknown[]>>
    get(input: EntityIdInput): Promise<ApiResult<unknown | null>>
    create(input: InterviewCreateInput): Promise<ApiResult<{ id: string }>>
    update(input: InterviewUpdateInput): Promise<ApiResult<unknown | null>>
    delete(input: EntityIdInput): Promise<ApiResult<void>>
    deletePast(input: EntityIdInput & { confirm: true }): Promise<ApiResult<void>>
    complete(input: EntityIdInput): Promise<ApiResult<void>>
    setType(input: EntityIdInput & { type: InterviewType }): Promise<ApiResult<void>>
    setNotification(input: InterviewNotificationInput): Promise<ApiResult<void>>
    saveReview(input: InterviewReviewInput): Promise<ApiResult<void>>
    questions: {
      list(input: EntityIdInput): Promise<ApiResult<unknown[]>>
      listByApplication(input: EntityIdInput): Promise<ApiResult<unknown[]>>
      add(input: InterviewQuestionInput): Promise<ApiResult<{ id: string }>>
      update(input: InterviewQuestionUpdateInput): Promise<ApiResult<unknown>>
      delete(input: EntityIdInput): Promise<ApiResult<void>>
    }
    questionBank: { search(input: QuestionBankSearchInput): Promise<ApiResult<unknown[]>> }
  }
  changes: { subscribe(listener: (change: JobFlowChange) => void): () => void }
  profile: {
    get(): Promise<ApiResult<unknown>>
    save(input: ProfileInput): Promise<ApiResult<void>>
    education: {
      add(input: EducationInput): Promise<ApiResult<unknown>>
      update(input: EducationInput & EntityIdInput): Promise<ApiResult<unknown>>
      delete(input: EntityIdInput): Promise<ApiResult<void>>
    }
    internships: {
      add(input: InternshipInput): Promise<ApiResult<unknown>>
      update(input: InternshipInput & EntityIdInput): Promise<ApiResult<unknown>>
      delete(input: EntityIdInput): Promise<ApiResult<void>>
    }
    projects: {
      add(input: ProjectInput): Promise<ApiResult<unknown>>
      update(input: ProjectInput & EntityIdInput): Promise<ApiResult<unknown>>
      delete(input: EntityIdInput): Promise<ApiResult<void>>
    }
    customFields: {
      save(input: CustomFieldInput): Promise<ApiResult<unknown>>
      delete(input: { fieldKey: string }): Promise<ApiResult<void>>
    }
  }
  resumes: {
    list(): Promise<ApiResult<unknown[]>>
    importFromDialog(input?: ResumeImportInput): Promise<ApiResult<unknown | null>>
    open(input: EntityIdInput): Promise<ApiResult<void>>
    readPdf(input: EntityIdInput): Promise<ApiResult<{ name: string; base64: string }>>
    showInFolder(input: EntityIdInput): Promise<ApiResult<void>>
  }
  settings: {
    getInfo(): Promise<ApiResult<SettingsInfo>>
    openDataDirectory(): Promise<ApiResult<void>>
  }
  backup: {
    exportFromDialog(): Promise<ApiResult<{ canceled: boolean }>>
    restoreFromDialog(): Promise<ApiResult<{ canceled: boolean; staged: boolean }>>
    exportCsvFromDialog(): Promise<ApiResult<{ canceled: boolean }>>
    applyStagedRestoreAndRestart(): Promise<
      ApiResult<{ applied: boolean; error?: string; restartRequired: boolean }>
    >
  }
  links: { openExternal(input: ExternalLinkInput): Promise<ApiResult<void>> }
  browser: {
    getState(): Promise<ApiResult<BrowserState>>
    openTab(input: BrowserInput): Promise<ApiResult<{ id: string }>>
    activateTab(input: BrowserTabId): Promise<ApiResult<void>>
    closeTab(input: BrowserTabId): Promise<ApiResult<void>>
    navigate(input: BrowserNavigateInput): Promise<ApiResult<void>>
    back(): Promise<ApiResult<void>>
    forward(): Promise<ApiResult<void>>
    reload(): Promise<ApiResult<void>>
    setBounds(input: BrowserBounds): Promise<ApiResult<void>>
    capturePage(): Promise<ApiResult<BrowserPageCapture>>
    captureJob(
      input: BrowserCaptureJobInput,
    ): Promise<
      ApiResult<
        | { kind: 'created'; id: string; applicationId: string; duplicateAccepted: boolean }
        | { kind: 'duplicates'; matches: unknown[] }
      >
    >
    listSites(input?: { query?: string }): Promise<ApiResult<unknown[]>>
    saveSite(input: BrowserSiteInput): Promise<ApiResult<unknown>>
    deleteSite(input: BrowserTabId): Promise<ApiResult<void>>
    listHistory(input?: BrowserHistoryLimit): Promise<ApiResult<unknown[]>>
    clearHistory(): Promise<ApiResult<void>>
    clearSession(): Promise<ApiResult<void>>
    inspectForm(input: BrowserInspectFormInput): Promise<ApiResult<BrowserFormField[]>>
    listAutofillMappings(
      input: BrowserHostnameInput,
    ): Promise<ApiResult<Array<{ hostname: string; signature: string; sourceKey: string }>>>
    saveAutofillMapping(input: BrowserAutofillMappingInput): Promise<ApiResult<void>>
    fillProfileFields(input: BrowserFillFieldsInput): Promise<ApiResult<{ filled: number }>>
    uploadResume(input: BrowserUploadResumeInput): Promise<ApiResult<{ uploaded: boolean }>>
    fillFocusedField(input: BrowserFillFocusedFieldInput): Promise<ApiResult<{ filled: boolean }>>
    copyProfileValue(input: BrowserClipboardInput): Promise<ApiResult<void>>
    subscribe(listener: (state: BrowserState) => void): () => void
  }
}

declare global {
  interface Window {
    jobflow: JobFlowApi
  }
}
