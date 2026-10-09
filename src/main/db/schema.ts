import { desc, sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    careersUrl: text('careers_url'),
    website: text('website'),
    notes: text('notes'),
    industryId: text('industry_id'),
    directoryId: text('directory_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('idx_companies_industry').on(table.industryId, table.archivedAt),
    uniqueIndex('idx_companies_directory_id')
      .on(table.directoryId)
      .where(sql`${table.directoryId} IS NOT NULL`),
  ],
)
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    department: text('department'),
    city: text('city'),
    jobCode: text('job_code'),
    salary: text('salary'),
    deadline: text('deadline'),
    requirements: text('requirements'),
    notes: text('notes'),
    // Legacy column retained in SQLite for migration compatibility; migration 0007 clears it.
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('idx_jobs_company').on(table.companyId), index('idx_jobs_deleted').on(table.deletedAt)],
)
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at').notNull(),
})
export const jobTags = sqliteTable(
  'job_tags',
  {
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.tagId] })],
)
export const jobListings = sqliteTable(
  'job_listings',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    url: text('url'),
    source: text('source'),
    pageTitle: text('page_title'),
    jdText: text('jd_text'),
    capturedAt: text('captured_at').notNull(),
    deadlineSnapshot: text('deadline_snapshot'),
    isPrimary: integer('is_primary').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_listings_job_capture').on(table.jobId, desc(table.capturedAt)),
    index('idx_listings_url').on(table.url),
    uniqueIndex('idx_one_primary_listing_per_job')
      .on(table.jobId)
      .where(sql`${table.isPrimary} = 1`),
    check('job_listings_primary_check', sql`${table.isPrimary} IN (0,1)`),
  ],
)
export const resumeVersions = sqliteTable(
  'resume_versions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    relativePath: text('relative_path').notNull(),
    originalName: text('original_name').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [uniqueIndex('idx_resume_relative_path').on(table.relativePath)],
)
export const applications = sqliteTable(
  'applications',
  {
    // Legacy column retained in SQLite for migration compatibility; migration 0007 clears it.
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    currentStage: text('current_stage').notNull(),
    priority: integer('priority').notNull().default(2),
    pinned: integer('pinned').notNull().default(0),
    resumeVersionId: text('resume_version_id').references(() => resumeVersions.id, { onDelete: 'set null' }),
    appliedAt: text('applied_at'),
    nextAction: text('next_action'),
    nextActionAt: text('next_action_at'),
    stageNotificationEnabled: integer('stage_notification_enabled').notNull().default(0),
    stageNotificationAt: text('stage_notification_at'),
    stageNotificationSentAt: text('stage_notification_sent_at'),
    nextActionNotificationEnabled: integer('next_action_notification_enabled').notNull().default(0),
    nextActionNotificationAt: text('next_action_notification_at'),
    nextActionNotificationSentAt: text('next_action_notification_sent_at'),
    closeReason: text('close_reason'),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    interviewReturnStage: text('interview_return_stage'),
  },
  (table) => [
    index('idx_applications_stage').on(table.currentStage),
    index('idx_applications_next_action').on(table.nextActionAt),
    check(
      'applications_stage_check',
      sql`${table.currentStage} IN ('TO_APPLY','APPLIED','ASSESSMENT_PENDING','ASSESSMENT_DONE','WRITTEN_TEST_PENDING','WRITTEN_TEST_DONE','INTERVIEW_PENDING','INTERVIEW_DONE','TECH_INTERVIEW','HR_INTERVIEW','OFFER_COMMUNICATION','OFFER','CLOSED')`,
    ),
    check('applications_priority_check', sql`${table.priority} BETWEEN 1 AND 3`),
    check('applications_pinned_check', sql`${table.pinned} IN (0,1)`),
    check(
      'applications_close_reason_check',
      sql`${table.closeReason} IS NULL OR ${table.closeReason} IN ('REJECTED','VOLUNTARY','HC_CLOSED','NO_RESPONSE','OFFER_DECLINED','OTHER')`,
    ),
  ],
)
export const applicationEvents = sqliteTable(
  'application_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    stage: text('stage'),
    channel: text('channel'),
    eventAt: text('event_at').notNull(),
    notes: text('notes'),
    interviewId: text('interview_id'),
    interviewRoundNumber: integer('interview_round_number'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_events_timeline').on(table.applicationId, desc(table.eventAt)),
    uniqueIndex('idx_events_interview_round')
      .on(table.interviewId, table.interviewRoundNumber)
      .where(sql`${table.interviewId} IS NOT NULL AND ${table.interviewRoundNumber} IS NOT NULL`),
    check(
      'events_type_check',
      sql`${table.type} IN ('SAVED','STAGE_CHANGED','APPLICATION_SUBMITTED','ASSESSMENT_RECEIVED','ASSESSMENT_COMPLETED','WRITTEN_TEST_RECEIVED','WRITTEN_TEST_COMPLETED','INTERVIEW_SCHEDULED','OFFER_RECEIVED','CLOSED','NOTE','OTHER')`,
    ),
  ],
)
export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    remindAt: text('remind_at').notNull(),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_reminders_due').on(table.remindAt, table.completedAt)],
)
export const interviews = sqliteTable(
  'interviews',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    round: text('round').notNull(),
    roundNumber: integer('round_number'),
    cancelledAt: text('cancelled_at'),
    endedAt: text('ended_at'),
    interviewAt: text('interview_at').notNull(),
    durationMinutes: integer('duration_minutes'),
    format: text('format'),
    result: text('result'),
    overallPerformance: text('overall_performance'),
    strengths: text('strengths'),
    gaps: text('gaps'),
    knowledgeGaps: text('knowledge_gaps'),
    nextPrep: text('next_prep'),
    notificationEnabled: integer('notification_enabled').notNull().default(0),
    notificationAt: text('notification_at'),
    notificationSentAt: text('notification_sent_at'),
    completedAt: text('completed_at'),
    mode: text('mode'),
    location: text('location'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_interviews_schedule').on(table.interviewAt),
    index('idx_interviews_notifications').on(
      table.notificationEnabled,
      table.notificationAt,
      table.notificationSentAt,
    ),
    uniqueIndex('idx_interviews_active_application_round')
      .on(table.applicationId, table.roundNumber)
      .where(
        sql`${table.roundNumber} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.endedAt} IS NULL`,
      ),
    check('interviews_notification_enabled_check', sql`${table.notificationEnabled} IN (0,1)`),
    check(
      'interviews_type_check',
      sql`${table.type} IN ('TECHNICAL','HR','MANAGER','CROSS_FUNCTIONAL','OTHER')`,
    ),
  ],
)
export const interviewQuestions = sqliteTable(
  'interview_questions',
  {
    id: text('id').primaryKey(),
    interviewId: text('interview_id')
      .notNull()
      .references(() => interviews.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    category: text('category').notNull(),
    myAnswer: text('my_answer'),
    betterAnswer: text('better_answer'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_questions_category').on(table.category)],
)
export const profile = sqliteTable(
  'profile',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    gender: text('gender'),
    birthday: text('birthday'),
    hometown: text('hometown'),
    currentCity: text('current_city'),
    expectedCity: text('expected_city'),
    expectedSalary: text('expected_salary'),
    documentType: text('document_type'),
    documentNumber: text('document_number'),
    ethnicity: text('ethnicity'),
    emergencyContactName: text('emergency_contact_name'),
    emergencyContactPhone: text('emergency_contact_phone'),
    mailingAddress: text('mailing_address'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('profile_default_id_check', sql`${table.id} = 'default'`)],
)
export const education = sqliteTable('education', {
  id: text('id').primaryKey(),
  school: text('school').notNull(),
  degree: text('degree'),
  major: text('major'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
})
export const internships = sqliteTable(
  'internships',
  {
    id: text('id').primaryKey(),
    employer: text('employer').notNull(),
    role: text('role'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('idx_internships_order').on(table.sortOrder, table.id)],
)
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
})
export const customFields = sqliteTable('custom_fields', {
  id: text('id').primaryKey(),
  fieldKey: text('field_key').notNull().unique(),
  label: text('label').notNull(),
  value: text('value'),
  updatedAt: text('updated_at').notNull(),
})
export const autofillMappings = sqliteTable(
  'autofill_mappings',
  {
    id: text('id').primaryKey(),
    hostname: text('hostname').notNull(),
    fieldSignature: text('field_signature').notNull(),
    profileField: text('profile_field').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('autofill_hostname_signature').on(table.hostname, table.fieldSignature)],
)
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})
export const recruitmentSites = sqliteTable(
  'recruitment_sites',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    kind: text('kind').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_recruitment_sites_url').on(table.url),
    index('idx_recruitment_sites_company').on(table.companyId, table.kind),
  ],
)
export const browserHistory = sqliteTable(
  'browser_history',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    title: text('title').notNull().default(''),
    visitedAt: text('visited_at').notNull(),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  },
  (table) => [index('idx_browser_history_visited').on(table.visitedAt)],
)
export const jobSearchMap = sqliteTable('job_search_map', {
  rowid: integer('rowid').primaryKey({ autoIncrement: true }),
  jobId: text('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: 'cascade' }),
})
