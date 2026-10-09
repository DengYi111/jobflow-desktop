import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { AppError } from '../errors/app-error'
import {
  addListingInputSchema,
  applicationActionCompletionInputSchema,
  applicationEventTypeSchema,
  applicationEventUpdateInputSchema,
  applicationStageSchema,
  applicationSubmitInputSchema,
  applicationTransitionInputSchema,
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
  browserSiteListSchema,
  browserTabIdSchema,
  browserUploadResumeSchema,
  companyArchiveInputSchema,
  companyCreateInputSchema,
  companyDirectoryImportInputSchema,
  companyDirectoryListInputSchema,
  companyListInputSchema,
  companyUpdateInputSchema,
  customFieldInputSchema,
  dateRangeInputSchema,
  educationInputSchema,
  emptyInputSchema,
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
  notificationPreferenceSchema,
  profileInputSchema,
  projectInputSchema,
  questionBankSearchInputSchema,
  reminderCreateInputSchema,
  resumeImportInputSchema,
  updateListingInputSchema,
} from '../../shared/schemas/common'

type SenderFrame = { url: string; isMainFrame?: boolean }
type DispatchRequest = { senderFrame: SenderFrame; args: unknown[] }
type Handler = (args: unknown[]) => Promise<unknown>
type Services = Partial<Record<string, Handler>>
type ChangeNotice = {
  domain: 'companies' | 'jobs' | 'applications' | 'interviews' | 'profile'
  entityId?: string
}

const unsupported = async () => ({ ok: false, code: 'NOT_IMPLEMENTED', messageZh: '此功能即将开放' })
const methodSchemas: Record<string, z.ZodType> = {
  'jobflow:dashboard.getSummary': emptyInputSchema,
  'jobflow:dashboard.listDueItems': dateRangeInputSchema,
  'jobflow:dashboard.getNotificationsEnabled': emptyInputSchema,
  'jobflow:dashboard.setNotificationsEnabled': notificationPreferenceSchema,
  'jobflow:companies.list': companyListInputSchema,
  'jobflow:companies.listDirectory': companyDirectoryListInputSchema,
  'jobflow:companies.addFromDirectory': companyDirectoryImportInputSchema,
  'jobflow:companies.create': companyCreateInputSchema,
  'jobflow:companies.update': companyUpdateInputSchema,
  'jobflow:companies.get': entityIdInputSchema,
  'jobflow:companies.archive': companyArchiveInputSchema,
  'jobflow:jobs.list': jobsListInputSchema,
  'jobflow:jobs.get': entityIdInputSchema,
  'jobflow:jobs.create': jobCreateInputSchema,
  'jobflow:jobs.update': jobUpdateInputSchema,
  'jobflow:jobs.softDelete': entityIdInputSchema,
  'jobflow:jobs.restore': entityIdInputSchema,
  'jobflow:jobs.permanentlyDelete': z.object({ id: z.string().uuid(), confirm: z.literal(true) }).strict(),
  'jobflow:jobs.clearTrash': z.object({ confirm: z.literal(true) }).strict(),
  'jobflow:jobs.findDuplicates': jobDuplicateInputSchema,
  'jobflow:jobs.addListing': addListingInputSchema,
  'jobflow:jobs.updateListing': updateListingInputSchema,
  'jobflow:links.openExternal': externalLinkInputSchema,
  'jobflow:browser.getState': emptyInputSchema,
  'jobflow:browser.openTab': browserInputSchema,
  'jobflow:browser.activateTab': browserTabIdSchema,
  'jobflow:browser.closeTab': browserTabIdSchema,
  'jobflow:browser.navigate': browserNavigateInputSchema,
  'jobflow:browser.back': emptyInputSchema,
  'jobflow:browser.forward': emptyInputSchema,
  'jobflow:browser.reload': emptyInputSchema,
  'jobflow:browser.setBounds': browserBoundsSchema,
  'jobflow:browser.capturePage': emptyInputSchema,
  'jobflow:browser.captureJob': browserCaptureJobInputSchema,
  'jobflow:browser.listSites': browserSiteListSchema,
  'jobflow:browser.saveSite': browserSiteInputSchema,
  'jobflow:browser.deleteSite': entityIdInputSchema,
  'jobflow:browser.listHistory': browserHistoryLimitSchema,
  'jobflow:browser.clearHistory': emptyInputSchema,
  'jobflow:browser.clearSession': emptyInputSchema,
  'jobflow:browser.inspectForm': browserInspectFormSchema,
  'jobflow:browser.listAutofillMappings': browserHostnameSchema,
  'jobflow:browser.saveAutofillMapping': browserAutofillMappingSchema,
  'jobflow:browser.fillProfileFields': browserFillFieldsSchema,
  'jobflow:browser.uploadResume': browserUploadResumeSchema,
  'jobflow:browser.fillFocusedField': browserFillFocusedFieldSchema,
  'jobflow:browser.copyProfileValue': browserClipboardSchema,
  'jobflow:applications.transition': applicationTransitionInputSchema,
  'jobflow:applications.submit': applicationSubmitInputSchema,
  'jobflow:applications.setResumeVersion': z
    .object({ id: z.string().uuid(), resumeVersionId: z.string().uuid().nullable() })
    .strict(),
  'jobflow:applications.completeStageAction': applicationActionCompletionInputSchema,
  'jobflow:applications.completeNextAction': entityIdInputSchema,
  'jobflow:applications.setStageNotification': interviewNotificationInputSchema,
  'jobflow:applications.setNextActionNotification': interviewNotificationInputSchema,
  'jobflow:applications.addEvent': z
    .object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      type: applicationEventTypeSchema.optional(),
      stage: applicationStageSchema.optional(),
      at: z.string().datetime({ offset: true }).optional(),
      channel: z.string().max(100).optional(),
      notes: z.string().max(10000).optional(),
    })
    .strict(),
  'jobflow:applications.updateEvent': applicationEventUpdateInputSchema,
  'jobflow:applications.deleteEvent': entityIdInputSchema,
  'jobflow:applications.setNextAction': z
    .object({
      id: z.string().uuid(),
      nextAction: z.string().max(500).nullable(),
      nextActionAt: z.string().datetime({ offset: true }).nullable(),
    })
    .strict(),
  'jobflow:applications.listTimeline': entityIdInputSchema,
  'jobflow:reminders.create': reminderCreateInputSchema,
  'jobflow:reminders.complete': entityIdInputSchema,
  'jobflow:reminders.listDue': dateRangeInputSchema,
  'jobflow:interviews.list': dateRangeInputSchema,
  'jobflow:interviews.get': entityIdInputSchema,
  'jobflow:interviews.create': interviewCreateInputSchema,
  'jobflow:interviews.update': interviewUpdateInputSchema,
  'jobflow:interviews.delete': entityIdInputSchema,
  'jobflow:interviews.deletePast': z.object({ id: z.string().uuid(), confirm: z.literal(true) }).strict(),
  'jobflow:interviews.setType': z
    .object({
      id: z.string().uuid(),
      type: z.enum(['TECHNICAL', 'HR', 'MANAGER', 'CROSS_FUNCTIONAL', 'OTHER']),
    })
    .strict(),
  'jobflow:interviews.complete': entityIdInputSchema,
  'jobflow:interviews.setNotification': interviewNotificationInputSchema,
  'jobflow:interviews.saveReview': interviewReviewInputSchema,
  'jobflow:interviews.questions.list': entityIdInputSchema,
  'jobflow:interviews.questions.listByApplication': entityIdInputSchema,
  'jobflow:interviews.questions.add': interviewQuestionInputSchema,
  'jobflow:interviews.questions.update': interviewQuestionUpdateInputSchema,
  'jobflow:interviews.questions.delete': entityIdInputSchema,
  'jobflow:interviews.questionBank.search': questionBankSearchInputSchema,
  'jobflow:profile.get': emptyInputSchema,
  'jobflow:profile.save': profileInputSchema,
  'jobflow:profile.education.add': educationInputSchema,
  'jobflow:profile.education.update': educationInputSchema.extend({ id: z.string().uuid() }).strict(),
  'jobflow:profile.education.delete': entityIdInputSchema,
  'jobflow:profile.internships.add': internshipInputSchema,
  'jobflow:profile.internships.update': internshipInputSchema.extend({ id: z.string().uuid() }).strict(),
  'jobflow:profile.internships.delete': entityIdInputSchema,
  'jobflow:profile.projects.add': projectInputSchema,
  'jobflow:profile.projects.update': projectInputSchema.extend({ id: z.string().uuid() }).strict(),
  'jobflow:profile.projects.delete': entityIdInputSchema,
  'jobflow:profile.customFields.save': customFieldInputSchema,
  'jobflow:profile.customFields.delete': z.object({ fieldKey: z.string().trim().min(1).max(80) }).strict(),
  'jobflow:resumes.list': emptyInputSchema,
  'jobflow:resumes.importFromDialog': resumeImportInputSchema,
  'jobflow:resumes.open': entityIdInputSchema,
  'jobflow:resumes.readPdf': entityIdInputSchema,
  'jobflow:resumes.showInFolder': entityIdInputSchema,
  'jobflow:settings.getInfo': emptyInputSchema,
  'jobflow:settings.openDataDirectory': emptyInputSchema,
  'jobflow:backup.exportFromDialog': emptyInputSchema,
  'jobflow:backup.restoreFromDialog': emptyInputSchema,
  'jobflow:backup.exportCsvFromDialog': emptyInputSchema,
  'jobflow:backup.applyStagedRestoreAndRestart': emptyInputSchema,
}

export function assertTrustedSender(senderFrame: SenderFrame, expectedOrigin: string): void {
  const actual = new URL(senderFrame.url)
  const expected = new URL(expectedOrigin)
  if (
    senderFrame.isMainFrame === false ||
    actual.protocol !== expected.protocol ||
    actual.host !== expected.host
  ) {
    throw new Error('Untrusted IPC sender')
  }
}

export function createHandlerRegistry(
  expectedOrigin: string,
  services: Services,
  onChange?: (change: ChangeNotice) => void,
  reportError?: (channel: string, error: unknown) => void,
) {
  const handlers = new Map<string, Handler>()
  for (const [channel, schema] of Object.entries(methodSchemas)) {
    handlers.set(channel, async (args) => {
      try {
        const parsed = schema.parse(args[0] ?? {})
        const result = (await (services[channel] ?? unsupported)([parsed])) as {
          ok?: boolean
          data?: unknown
        }
        const change = successfulMutationChange(channel, parsed, result)
        if (change) onChange?.(change)
        return result
      } catch (error) {
        if (error instanceof z.ZodError) {
          const messages = error.issues.map((issue) => issue.message)
          const userMessage =
            messages.length && messages.every((message) => /[\u3400-\u9fff]/.test(message))
              ? messages.join('；')
              : '输入内容有误，请检查必填项和格式后重试'
          throw new Error(userMessage)
        }
        reportError?.(channel, error)
        if (error instanceof AppError) throw new Error(error.userMessage)
        const message = error instanceof Error ? error.message : ''
        if (message.length <= 200 && /[\u3400-\u9fff]/.test(message)) throw new Error(message)
        throw new Error('操作失败，请重试')
      }
    })
  }
  return {
    channels: [...handlers.keys()],
    async dispatch(channel: string, request: DispatchRequest): Promise<unknown> {
      assertTrustedSender(request.senderFrame, expectedOrigin)
      const handler = handlers.get(channel)
      if (!handler) throw new Error('Unknown IPC method')
      return handler(request.args)
    },
  }
}

function successfulMutationChange(
  channel: string,
  input: unknown,
  result: { ok?: boolean; data?: unknown },
): ChangeNotice | undefined {
  if (result?.ok !== true) return undefined
  const [prefix, ...methodParts] = channel.slice('jobflow:'.length).split('.')
  const method = methodParts.join('.')
  const writes: Record<string, Set<string>> = {
    companies: new Set(['create', 'update', 'archive', 'addFromDirectory']),
    jobs: new Set([
      'create',
      'update',
      'softDelete',
      'restore',
      'permanentlyDelete',
      'clearTrash',
      'addListing',
      'updateListing',
    ]),
    applications: new Set([
      'transition',
      'submit',
      'setResumeVersion',
      'completeStageAction',
      'completeNextAction',
      'setStageNotification',
      'setNextActionNotification',
      'addEvent',
      'updateEvent',
      'deleteEvent',
      'setNextAction',
    ]),
    interviews: new Set([
      'create',
      'update',
      'delete',
      'deletePast',
      'complete',
      'setType',
      'setNotification',
      'saveReview',
      'questions.add',
      'questions.update',
      'questions.delete',
    ]),
    profile: new Set([
      'save',
      'education.add',
      'education.update',
      'education.delete',
      'internships.add',
      'internships.update',
      'internships.delete',
      'projects.add',
      'projects.update',
      'projects.delete',
      'customFields.save',
      'customFields.delete',
    ]),
  }
  if (!prefix || !writes[prefix]?.has(method ?? '')) return undefined
  const values = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const data = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : {}
  const entityCandidates =
    prefix === 'jobs' || prefix === 'companies'
      ? [values.id, data.id, values.jobId]
      : [values.id, values.applicationId, data.applicationId, data.id]
  const entityId = entityCandidates.find((value): value is string => typeof value === 'string')
  return { domain: prefix as ChangeNotice['domain'], ...(entityId ? { entityId } : {}) }
}

export function registerHandlers(
  ipcMain: IpcMain,
  expectedOrigin: string,
  services: Services = {},
  onChange?: (change: ChangeNotice) => void,
  reportError?: (channel: string, error: unknown) => void,
): void {
  const registry = createHandlerRegistry(expectedOrigin, services, onChange, reportError)
  for (const channel of registry.channels) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args) =>
      registry.dispatch(channel, {
        senderFrame: {
          url: event.senderFrame?.url ?? '',
          isMainFrame: event.senderFrame === event.sender.mainFrame,
        },
        args,
      }),
    )
  }
}
