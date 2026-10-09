import { z } from 'zod'
import { applicationEventTypes, applicationStages, selectableApplicationStages } from '../constants/stages'
import { companyIndustryIds } from '../constants/company-industries'

export const idSchema = z.string().uuid()
export const dateTimeSchema = z.string().datetime({ offset: true })
export const applicationStageSchema = z.enum(applicationStages)
export const applicationEventTypeSchema = z.enum(applicationEventTypes)
export const pageSchema = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  })
  .strict()
export const emptyInputSchema = z.object({}).strict()
const optionalUrlSchema = z
  .union([z.string().url().max(2048).nullable(), z.literal('')])
  .optional()
  .transform((value) => (value === '' ? null : value))
const optionalDateTimeSchema = z
  .union([dateTimeSchema.nullable(), z.literal('')])
  .optional()
  .transform((value) => (value === '' ? null : value))

export const jobsListInputSchema = z
  .object({
    filters: z
      .object({
        query: z.string().trim().max(200).optional(),
        city: z.string().trim().max(100).optional(),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        stage: z.union([applicationStageSchema, z.literal('DELETED')]).optional(),
        tag: z.string().trim().max(100).optional(),
        appliedFrom: z.string().date().optional(),
        appliedTo: z.string().date().optional(),
        deadlineFrom: z.string().date().optional(),
        deadlineTo: z.string().date().optional(),
        companyId: idSchema.optional(),
      })
      .strict()
      .default({}),
    sort: z.enum(['updatedAt', 'priority', 'appliedAt']).nullable().optional(),
    direction: z.enum(['asc', 'desc']).default('desc'),
    page: pageSchema.default({ page: 1, pageSize: 20 }),
  })
  .strict()

export const entityIdInputSchema = z.object({ id: idSchema }).strict()
export const dateRangeInputSchema = z
  .object({ from: dateTimeSchema.optional(), to: dateTimeSchema.optional() })
  .strict()
export const companyIndustryIdSchema = z.enum(companyIndustryIds)
export const companyListInputSchema = z
  .object({ query: z.string().trim().max(200).optional(), industryId: companyIndustryIdSchema.optional() })
  .strict()
export const companyDirectoryListInputSchema = companyListInputSchema
export const companyDirectoryImportInputSchema = z
  .object({
    directoryId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
  })
  .strict()
export const companyCreateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    industryId: companyIndustryIdSchema.nullable().optional(),
    careersUrl: optionalUrlSchema,
    website: optionalUrlSchema,
    notes: z.string().max(10000).nullable().optional(),
  })
  .strict()
export const companyUpdateInputSchema = companyCreateInputSchema.partial().extend({ id: idSchema }).strict()
export const companyArchiveInputSchema = entityIdInputSchema
export const jobCreateInputSchema = z
  .object({
    companyId: idSchema,
    title: z.string().trim().min(1).max(200),
    city: z.string().max(100).nullable().optional(),
    department: z.string().max(150).nullable().optional(),
    jobCode: z.string().max(100).nullable().optional(),
    salary: z.string().max(100).nullable().optional(),
    deadline: z.string().max(40).nullable().optional(),
    requirements: z.string().max(20000).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    pinned: z.boolean().optional(),
    nextAction: z.string().max(500).nullable().optional(),
    nextActionAt: optionalDateTimeSchema,
    url: optionalUrlSchema,
    source: z.string().max(200).nullable().optional(),
    pageTitle: z.string().max(300).nullable().optional(),
    jdText: z.string().max(100000).nullable().optional(),
    deadlineSnapshot: z.string().max(40).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
export const jobUpdateInputSchema = jobCreateInputSchema
  .omit({ allowDuplicate: true, jdText: true })
  .partial()
  .extend({ id: idSchema, expectedUpdatedAt: z.string().datetime({ offset: true }).optional() })
  .strict()
export const jobDuplicateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    companyId: idSchema.optional(),
    url: z.string().url().max(2048).optional(),
  })
  .strict()
export const addListingInputSchema = z
  .object({
    jobId: idSchema,
    url: optionalUrlSchema,
    source: z.string().max(200).nullable().optional(),
    pageTitle: z.string().max(300).nullable().optional(),
    capturedAt: dateTimeSchema.optional(),
    jdText: z.string().max(100000).nullable().optional(),
    deadlineSnapshot: z.string().max(40).nullable().optional(),
  })
  .strict()
export const updateListingInputSchema = z
  .object({
    id: idSchema,
    url: optionalUrlSchema,
    source: z.string().max(200).nullable().optional(),
    pageTitle: z.string().max(300).nullable().optional(),
    capturedAt: dateTimeSchema.optional(),
    deadlineSnapshot: z.string().max(40).nullable().optional(),
  })
  .strict()
export const externalLinkInputSchema = z
  .object({
    url: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value)
          return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        } catch {
          return false
        }
      }, 'Only credential-free HTTP(S) URLs are allowed'),
  })
  .strict()
export const browserInputSchema = z.object({ value: z.string().trim().min(1).max(2048) }).strict()
export const browserTabIdSchema = z.object({ id: idSchema }).strict()
const secureBrowserUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password
    } catch {
      return false
    }
  })
export const browserSiteInputSchema = z
  .object({
    companyId: idSchema.nullable().optional(),
    name: z.string().trim().min(1).max(200),
    url: secureBrowserUrlSchema,
    kind: z.enum(['COMPANY', 'CAREERS']),
  })
  .strict()
export const browserCaptureJobInputSchema = z
  .object({
    companyId: idSchema.optional(),
    companyName: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    city: z.string().max(100).nullable().optional(),
    jobCode: z.string().max(100).nullable().optional(),
    deadline: z.string().max(40).nullable().optional(),
    requirements: z.string().max(20000).nullable().optional(),
    url: secureBrowserUrlSchema,
    pageTitle: z.string().max(500).nullable().optional(),
    jdText: z.string().max(50000).nullable().optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
export const browserNavigateInputSchema = browserTabIdSchema
  .extend({ value: z.string().trim().min(1).max(2048) })
  .strict()
export const browserSiteListSchema = z.object({ query: z.string().trim().max(200).optional() }).strict()
export const browserBoundsSchema = z
  .object({
    x: z.number().finite().min(0).max(10000),
    y: z.number().finite().min(0).max(10000),
    width: z.number().finite().min(0).max(10000),
    height: z.number().finite().min(0).max(10000),
  })
  .strict()
export const browserHistoryLimitSchema = z
  .object({ limit: z.number().int().min(1).max(500).default(100) })
  .strict()
export const browserHostnameSchema = z.object({ hostname: z.string().trim().min(1).max(253) }).strict()
export const browserInspectFormSchema = z
  .object({
    educationCount: z.number().int().min(0).max(20).default(0),
    internshipCount: z.number().int().min(0).max(20).default(0),
    projectCount: z.number().int().min(0).max(20).default(0),
  })
  .strict()
export const profileAutofillFieldSchema = z.enum([
  'name',
  'phone',
  'email',
  'gender',
  'birthday',
  'hometown',
  'currentCity',
  'expectedCity',
  'expectedSalary',
  'documentType',
  'documentNumber',
  'ethnicity',
  'emergencyContactName',
  'emergencyContactPhone',
  'mailingAddress',
  'school',
  'degree',
  'major',
  'graduationDate',
])
export const browserAutofillMappingSchema = browserHostnameSchema
  .extend({ signature: z.string().min(1).max(500), sourceKey: z.string().trim().min(1).max(160) })
  .strict()
export const browserFillFieldsSchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(179).optional(),
            indices: z.array(z.number().int().min(0).max(179)).max(180).optional(),
            signature: z.string().min(1).max(500),
            value: z.string().max(10000),
            kind: z.enum(['text', 'select', 'radio', 'checkbox', 'combobox', 'file']).optional(),
            options: z
              .array(
                z
                  .object({
                    label: z.string().max(300),
                    value: z.string().max(1000),
                    checked: z.boolean().optional(),
                  })
                  .strict(),
              )
              .max(200)
              .optional(),
          })
          .strict(),
      )
      .max(180),
  })
  .strict()
export const browserUploadResumeSchema = z
  .object({
    index: z.number().int().min(0).max(179),
    signature: z.string().min(1).max(500),
    fileName: z.string().trim().min(1).max(120),
    base64: z.string().min(1).max(36_000_000),
  })
  .strict()
export const browserClipboardSchema = z.object({ value: z.string().max(10000) }).strict()
export const browserFillFocusedFieldSchema = z.object({ value: z.string().max(2000) }).strict()
export const reminderCreateInputSchema = z
  .object({
    applicationId: idSchema,
    title: z.string().trim().min(1).max(200),
    remindAt: dateTimeSchema,
  })
  .strict()
export const closeReasonSchema = z.enum([
  'REJECTED',
  'VOLUNTARY',
  'HC_CLOSED',
  'NO_RESPONSE',
  'OFFER_DECLINED',
  'OTHER',
])
export const applicationTransitionInputSchema = z
  .object({
    id: idSchema,
    stage: z.enum(selectableApplicationStages),
    event: applicationEventTypeSchema.optional(),
    at: dateTimeSchema.optional(),
    notes: z.string().max(10000).optional(),
    channel: z.string().max(100).optional(),
    closeReason: closeReasonSchema.optional(),
    cancelOpenInterviews: z.boolean().optional(),
    endOpenInterviews: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.stage === 'CLOSED' && !input.closeReason)
      ctx.addIssue({ code: 'custom', path: ['closeReason'], message: '结束流程时必须填写结束原因' })
  })
export const applicationSubmitInputSchema = z
  .object({
    id: idSchema,
    appliedAt: dateTimeSchema,
    resumeVersionId: idSchema.nullable(),
    channel: z.string().trim().min(1).max(100),
    notes: z.string().max(10000).optional(),
    cancelOpenInterviews: z.boolean().optional(),
  })
  .strict()
export const applicationActionCompletionInputSchema = z
  .object({
    id: idSchema,
    appliedAt: dateTimeSchema.optional(),
    resumeVersionId: idSchema.nullable().optional(),
    channel: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strict()
export const applicationEventUpdateInputSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(200),
    at: dateTimeSchema,
    notes: z.string().max(10000).optional(),
  })
  .strict()
export const notificationPreferenceSchema = z.object({ enabled: z.boolean() }).strict()

const interviewInputSchema = z
  .object({
    applicationId: idSchema,
    roundNumber: z.number().int().positive(),
    interviewAt: dateTimeSchema,
    type: z.enum(['TECHNICAL', 'HR', 'MANAGER', 'CROSS_FUNCTIONAL', 'OTHER']).optional(),
    durationMinutes: z.number().int().positive().max(1440).nullable().optional(),
    format: z.string().max(100).nullable().optional(),
    mode: z.enum(['ONLINE', 'OFFLINE']).nullable().optional(),
    location: z.string().max(2048).nullable().optional(),
  })
  .strict()
export const interviewCreateInputSchema = interviewInputSchema
export const interviewUpdateInputSchema = interviewInputSchema
  .omit({ applicationId: true })
  .extend({ id: idSchema })
  .strict()
export const interviewNotificationInputSchema = z
  .object({ id: idSchema, enabled: z.boolean(), notificationAt: dateTimeSchema.nullable() })
  .strict()
export const interviewReviewInputSchema = z
  .object({
    id: idSchema,
    result: z.string().max(100).nullable().optional(),
    overallPerformance: z.string().max(5000).nullable().optional(),
    strengths: z.string().max(5000).nullable().optional(),
    gaps: z.string().max(5000).nullable().optional(),
    knowledgeGaps: z.string().max(5000).nullable().optional(),
    nextPrep: z.string().max(5000).nullable().optional(),
  })
  .strict()
export const interviewQuestionInputSchema = z
  .object({
    interviewId: idSchema,
    question: z.string().trim().min(1).max(2000),
    category: z.string().trim().min(1).max(100),
    myAnswer: z.string().max(10000).nullable().optional(),
    betterAnswer: z.string().max(10000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict()
export const interviewQuestionUpdateInputSchema = interviewQuestionInputSchema
  .omit({ interviewId: true })
  .partial()
  .extend({ id: idSchema })
  .strict()
export const questionBankSearchInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    category: z.string().max(100).optional(),
    companyId: idSchema.optional(),
    jobId: idSchema.optional(),
  })
  .strict()
export const profileInputSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    phone: z.string().max(100).nullable().optional(),
    email: z.string().max(200).nullable().optional(),
    gender: z.string().max(50).nullable().optional(),
    birthday: z.string().max(40).nullable().optional(),
    hometown: z.string().max(100).nullable().optional(),
    currentCity: z.string().max(100).nullable().optional(),
    expectedCity: z.string().max(100).nullable().optional(),
    expectedSalary: z.string().max(100).nullable().optional(),
    documentType: z.string().max(100).nullable().optional(),
    documentNumber: z.string().max(100).nullable().optional(),
    ethnicity: z.string().max(40).nullable().optional(),
    emergencyContactName: z.string().max(200).nullable().optional(),
    emergencyContactPhone: z.string().max(100).nullable().optional(),
    mailingAddress: z.string().max(500).nullable().optional(),
  })
  .strict()
export const educationInputSchema = z
  .object({
    school: z.string().trim().min(1).max(200),
    degree: z.string().max(100).nullable().optional(),
    major: z.string().max(200).nullable().optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict()
export const internshipInputSchema = z
  .object({
    employer: z.string().trim().min(1).max(200),
    role: z.string().max(200).nullable().optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict()
export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    role: z.string().max(200).nullable().optional(),
    startDate: z.string().max(40).nullable().optional(),
    endDate: z.string().max(40).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict()
export const customFieldInputSchema = z
  .object({
    fieldKey: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(100),
    value: z.string().max(10000).nullable().optional(),
  })
  .strict()
export const resumeImportInputSchema = z.object({ name: z.string().trim().max(200).optional() }).strict()
