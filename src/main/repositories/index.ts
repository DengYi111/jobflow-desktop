import type Database from 'better-sqlite3'
import { createApplicationsRepository } from './applications.repository'
import { createCompaniesRepository } from './companies.repository'
import { createEventsRepository } from './events.repository'
import { createInterviewsRepository } from './interviews.repository'
import { createInterviewFlowRepository } from './interview-flow.repository'
import { createJobsRepository } from './jobs.repository'
import { createProfileRepository } from './profile.repository'
import { createRemindersRepository } from './reminders.repository'
import { createResumesRepository } from './resumes.repository'
import { createSearchIndexSync } from './search-index.repository'
import { createBrowserRepository } from './browser.repository'

export function createRepositories(db: Database.Database) {
  const syncSearchIndex = createSearchIndexSync(db)
  return {
    companies: createCompaniesRepository(db, syncSearchIndex),
    jobs: createJobsRepository(db, syncSearchIndex),
    applications: createApplicationsRepository(db, syncSearchIndex),
    events: createEventsRepository(db),
    reminders: createRemindersRepository(db),
    interviews: createInterviewsRepository(db),
    interviewFlow: createInterviewFlowRepository(db),
    profile: createProfileRepository(db),
    resumes: createResumesRepository(db),
    browser: createBrowserRepository(db),
  }
}
