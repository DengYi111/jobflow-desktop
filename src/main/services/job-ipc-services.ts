import type Database from 'better-sqlite3'
import { createRepositories } from '../repositories'
import { createCompaniesService } from './companies.service'
import { createJobsService } from './jobs.service'
import { createLinksService } from './links.service'
import { createApplicationsService } from './applications.service'
import { createDashboardService } from './dashboard.service'
import { createRemindersService } from './reminders.service'
import { stageLabels, type ApplicationEventType } from '../../shared/constants/stages'
import { createInterviewsService } from './interviews.service'
import { createInterviewFlowService } from './interview-flow.service'
import { createProfileService } from './profile.service'
import { createResumesService, type ResumeDialog, type ResumeFileActions } from './resumes.service'
import { createBrowserCaptureService } from './browser-capture.service'
import type { InterviewType } from '../../shared/constants/interview-types'
import type { SecretProtector } from '../security/protected-value'
import { createSecureFileStore } from './secure-file-store'

const unavailableSecretProtector: SecretProtector = {
  async isAvailable() {
    return false
  },
  async encrypt() {
    throw new Error('系统安全存储不可用')
  },
  async decrypt() {
    throw new Error('系统安全存储不可用')
  },
}

export function createJobIpcServices(
  db: Database.Database,
  repositories = createRepositories(db),
  openExternal: (url: string) => Promise<void> = async () => {
    throw new Error('External links are unavailable')
  },
  libraryOptions: {
    userDataDirectory: string
    showOpenDialog: ResumeDialog
    fileActions?: ResumeFileActions
    secretProtector?: SecretProtector
  } = { userDataDirectory: '', showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
) {
  const jobs = createJobsService(db, repositories)
  const companies = createCompaniesService(db, repositories)
  const links = createLinksService(openExternal)
  const interviewFlow = createInterviewFlowService(db)
  const applications = createApplicationsService(repositories, interviewFlow)
  const dashboard = createDashboardService(db, repositories)
  const reminders = createRemindersService(repositories)
  const interviews = createInterviewsService(repositories, interviewFlow)
  const profile = createProfileService(
    repositories,
    libraryOptions.secretProtector ?? unavailableSecretProtector,
  )
  const protector = libraryOptions.secretProtector ?? unavailableSecretProtector
  const resumes = createResumesService(
    repositories,
    libraryOptions.userDataDirectory,
    libraryOptions.showOpenDialog,
    libraryOptions.fileActions,
    {
      protector,
      fileStore: createSecureFileStore(protector),
    },
  )
  const browserCapture = createBrowserCaptureService(db, repositories, jobs)
  const ok = <T>(operation: () => T) =>
    Promise.resolve()
      .then(operation)
      .then((data) => ({ ok: true as const, data }))
  return {
    initializeSecureData: () => resumes.migrateStorage(),
    'jobflow:dashboard.getSummary': () => ok(() => dashboard.getSummary()),
    'jobflow:dashboard.listDueItems': ([input]: unknown[]) =>
      ok(() => reminders.listDue(input as { from?: string; to?: string })),
    'jobflow:dashboard.getNotificationsEnabled': () => ok(() => dashboard.getNotificationsEnabled()),
    'jobflow:dashboard.setNotificationsEnabled': ([input]: unknown[]) =>
      ok(() => dashboard.setNotificationsEnabled((input as { enabled: boolean }).enabled)),
    'jobflow:companies.list': ([input]: unknown[]) => ok(() => companies.list(input as { query?: string })),
    'jobflow:companies.listDirectory': ([input]: unknown[]) =>
      ok(() => companies.listDirectory(input as Parameters<typeof companies.listDirectory>[0])),
    'jobflow:companies.addFromDirectory': ([input]: unknown[]) =>
      ok(() => companies.addFromDirectory(input as Parameters<typeof companies.addFromDirectory>[0])),
    'jobflow:companies.create': ([input]: unknown[]) =>
      ok(() => companies.create(input as Parameters<typeof companies.create>[0])),
    'jobflow:companies.update': ([input]: unknown[]) =>
      ok(() => companies.update(input as Parameters<typeof companies.update>[0])),
    'jobflow:companies.get': ([input]: unknown[]) => ok(() => companies.get((input as { id: string }).id)),
    'jobflow:companies.archive': ([input]: unknown[]) =>
      ok(() => companies.archive((input as { id: string }).id)),
    'jobflow:jobs.list': ([input]: unknown[]) =>
      ok(() => jobs.list(input as Parameters<typeof jobs.list>[0])),
    'jobflow:jobs.get': ([input]: unknown[]) => ok(() => jobs.get((input as { id: string }).id)),
    'jobflow:jobs.create': ([input]: unknown[]) => {
      const { allowDuplicate, ...fields } = input as Parameters<typeof jobs.create>[0] & {
        allowDuplicate?: boolean
      }
      return ok(() => jobs.create(fields, { allowDuplicate }))
    },
    'jobflow:jobs.update': ([input]: unknown[]) =>
      ok(() => jobs.update(input as Parameters<typeof jobs.update>[0])),
    'jobflow:jobs.softDelete': ([input]: unknown[]) =>
      ok(() => jobs.softDelete((input as { id: string }).id)),
    'jobflow:jobs.restore': ([input]: unknown[]) => ok(() => jobs.restore((input as { id: string }).id)),
    'jobflow:jobs.permanentlyDelete': ([input]: unknown[]) =>
      ok(() => jobs.permanentlyDelete((input as { id: string; confirm: true }).id)),
    'jobflow:jobs.clearTrash': () => ok(() => jobs.clearTrash()),
    'jobflow:jobs.findDuplicates': ([input]: unknown[]) =>
      ok(() => jobs.findDuplicates(input as Parameters<typeof jobs.findDuplicates>[0])),
    'jobflow:jobs.addListing': ([input]: unknown[]) => {
      const { jobId, ...fields } = input as {
        jobId: string
        url?: string | null
        source?: string | null
        pageTitle?: string | null
        capturedAt?: string
        jdText?: string | null
        deadlineSnapshot?: string | null
      }
      return ok(() => jobs.addListing(jobId, fields))
    },
    'jobflow:jobs.updateListing': ([input]: unknown[]) =>
      ok(() => jobs.updateListing(input as Parameters<typeof jobs.updateListing>[0])),
    'jobflow:links.openExternal': ([input]: unknown[]) =>
      ok(() => links.openExternal((input as { url: string }).url)),
    'jobflow:browser.captureJob': ([input]: unknown[]) =>
      ok(() => browserCapture.capture(input as Parameters<typeof browserCapture.capture>[0])),
    'jobflow:applications.transition': ([input]: unknown[]) => {
      const value = input as Omit<Parameters<typeof applications.transition>[1], 'title' | 'type'> & {
        id: string
        event?: ApplicationEventType
      }
      const { event, ...fields } = value
      return ok(() =>
        applications.transition(value.id, {
          ...fields,
          type: event,
          title: `阶段更新为${stageLabels['zh-CN'][value.stage]}`,
        }),
      )
    },
    'jobflow:applications.submit': ([input]: unknown[]) => {
      const value = input as Parameters<typeof applications.submit>[1] & { id: string }
      return ok(() => applications.submit(value.id, value))
    },
    'jobflow:applications.setResumeVersion': ([input]: unknown[]) =>
      ok(() => {
        const value = input as { id: string; resumeVersionId: string | null }
        return applications.setResumeVersion(value.id, value.resumeVersionId)
      }),
    'jobflow:applications.completeStageAction': ([input]: unknown[]) => {
      const value = input as {
        id: string
        appliedAt?: string
        resumeVersionId?: string | null
        channel?: string
        notes?: string
      }
      const submission =
        value.appliedAt && value.channel
          ? {
              appliedAt: value.appliedAt,
              resumeVersionId: value.resumeVersionId ?? null,
              channel: value.channel,
              notes: value.notes,
            }
          : undefined
      return ok(() => applications.completeStageAction(value.id, submission))
    },
    'jobflow:applications.completeNextAction': ([input]: unknown[]) =>
      ok(() => applications.completeNextAction((input as { id: string }).id)),
    'jobflow:applications.setStageNotification': ([input]: unknown[]) =>
      ok(() =>
        applications.setStageNotification(input as Parameters<typeof applications.setStageNotification>[0]),
      ),
    'jobflow:applications.setNextActionNotification': ([input]: unknown[]) =>
      ok(() =>
        applications.setNextActionNotification(
          input as Parameters<typeof applications.setNextActionNotification>[0],
        ),
      ),
    'jobflow:applications.addEvent': ([input]: unknown[]) => {
      const value = input as {
        id: string
        title: string
        type?: import('../../shared/constants/stages').ApplicationEventType
        stage?: import('../../shared/constants/stages').ApplicationStage
        at?: string
        channel?: string
        notes?: string
      }
      return ok(() => applications.addEvent(value.id, value))
    },
    'jobflow:applications.updateEvent': ([input]: unknown[]) => {
      const value = input as { id: string; title: string; type: 'NOTE' | 'OTHER'; at: string; notes?: string }
      return ok(() => applications.updateEvent(value.id, value))
    },
    'jobflow:applications.deleteEvent': ([input]: unknown[]) =>
      ok(() => applications.deleteEvent((input as { id: string }).id)),
    'jobflow:applications.setNextAction': ([input]: unknown[]) => {
      const value = input as { id: string; nextAction: string | null; nextActionAt: string | null }
      return ok(() => applications.setNextAction(value.id, value.nextAction, value.nextActionAt))
    },
    'jobflow:applications.listTimeline': ([input]: unknown[]) =>
      ok(() => applications.listTimeline((input as { id: string }).id)),
    'jobflow:reminders.create': ([input]: unknown[]) =>
      ok(() => reminders.create(input as Parameters<typeof reminders.create>[0])),
    'jobflow:reminders.complete': ([input]: unknown[]) =>
      ok(() => reminders.complete((input as { id: string }).id)),
    'jobflow:reminders.listDue': ([input]: unknown[]) =>
      ok(() => reminders.listDue(input as { from?: string; to?: string })),
    'jobflow:interviews.list': ([input]: unknown[]) =>
      ok(() => interviews.list(input as { from?: string; to?: string })),
    'jobflow:interviews.get': ([input]: unknown[]) => ok(() => interviews.get((input as { id: string }).id)),
    'jobflow:interviews.create': ([input]: unknown[]) =>
      ok(() => interviews.create(input as Parameters<typeof interviews.create>[0])),
    'jobflow:interviews.update': ([input]: unknown[]) =>
      ok(() => interviews.update(input as Parameters<typeof interviews.update>[0])),
    'jobflow:interviews.delete': ([input]: unknown[]) =>
      ok(() => interviews.delete((input as { id: string }).id)),
    'jobflow:interviews.deletePast': ([input]: unknown[]) =>
      ok(() => interviews.deletePast((input as { id: string }).id)),
    'jobflow:interviews.setType': ([input]: unknown[]) =>
      ok(() => {
        const value = input as { id: string; type: InterviewType }
        return interviews.setType(value.id, value.type)
      }),
    'jobflow:interviews.complete': ([input]: unknown[]) =>
      ok(() => interviews.complete((input as { id: string }).id)),
    'jobflow:interviews.setNotification': ([input]: unknown[]) =>
      ok(() => interviews.setNotification(input as Parameters<typeof interviews.setNotification>[0])),
    'jobflow:interviews.saveReview': ([input]: unknown[]) =>
      ok(() => interviews.saveReview(input as Parameters<typeof interviews.saveReview>[0])),
    'jobflow:interviews.questions.list': ([input]: unknown[]) =>
      ok(() => interviews.listQuestions((input as { id: string }).id)),
    'jobflow:interviews.questions.listByApplication': ([input]: unknown[]) =>
      ok(() => interviews.listQuestionsByApplication((input as { id: string }).id)),
    'jobflow:interviews.questions.add': ([input]: unknown[]) =>
      ok(() => interviews.addQuestion(input as Parameters<typeof interviews.addQuestion>[0])),
    'jobflow:interviews.questions.update': ([input]: unknown[]) =>
      ok(() => interviews.updateQuestion(input as Parameters<typeof interviews.updateQuestion>[0])),
    'jobflow:interviews.questions.delete': ([input]: unknown[]) =>
      ok(() => interviews.deleteQuestion((input as { id: string }).id)),
    'jobflow:interviews.questionBank.search': ([input]: unknown[]) =>
      ok(() => interviews.searchQuestionBank(input as Parameters<typeof interviews.searchQuestionBank>[0])),
    'jobflow:profile.get': () => ok(() => profile.get()),
    'jobflow:profile.save': ([input]: unknown[]) =>
      ok(() => profile.save(input as Parameters<typeof profile.save>[0])),
    'jobflow:profile.education.add': ([input]: unknown[]) =>
      ok(() => profile.addEducation(input as Parameters<typeof profile.addEducation>[0])),
    'jobflow:profile.education.update': ([input]: unknown[]) =>
      ok(() => profile.updateEducation(input as Parameters<typeof profile.updateEducation>[0])),
    'jobflow:profile.education.delete': ([input]: unknown[]) =>
      ok(() => profile.deleteEducation((input as { id: string }).id)),
    'jobflow:profile.internships.add': ([input]: unknown[]) =>
      ok(() => profile.addInternship(input as Parameters<typeof profile.addInternship>[0])),
    'jobflow:profile.internships.update': ([input]: unknown[]) =>
      ok(() => profile.updateInternship(input as Parameters<typeof profile.updateInternship>[0])),
    'jobflow:profile.internships.delete': ([input]: unknown[]) =>
      ok(() => profile.deleteInternship((input as { id: string }).id)),
    'jobflow:profile.projects.add': ([input]: unknown[]) =>
      ok(() => profile.addProject(input as Parameters<typeof profile.addProject>[0])),
    'jobflow:profile.projects.update': ([input]: unknown[]) =>
      ok(() => profile.updateProject(input as Parameters<typeof profile.updateProject>[0])),
    'jobflow:profile.projects.delete': ([input]: unknown[]) =>
      ok(() => profile.deleteProject((input as { id: string }).id)),
    'jobflow:profile.customFields.save': ([input]: unknown[]) =>
      ok(() => profile.saveCustomField(input as Parameters<typeof profile.saveCustomField>[0])),
    'jobflow:profile.customFields.delete': ([input]: unknown[]) =>
      ok(() => profile.deleteCustomField((input as { fieldKey: string }).fieldKey)),
    'jobflow:resumes.list': () => ok(() => resumes.list()),
    'jobflow:resumes.importFromDialog': ([input]: unknown[]) =>
      ok(() => resumes.importFromDialog(input as { name?: string })),
    'jobflow:resumes.open': ([input]: unknown[]) => ok(() => resumes.open((input as { id: string }).id)),
    'jobflow:resumes.readPdf': ([input]: unknown[]) =>
      ok(() => resumes.readPdf((input as { id: string }).id)),
    'jobflow:resumes.showInFolder': ([input]: unknown[]) =>
      ok(() => resumes.showInFolder((input as { id: string }).id)),
  }
}
