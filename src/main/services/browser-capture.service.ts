import type Database from 'better-sqlite3'
import type { createRepositories } from '../repositories'
import type { createJobsService } from './jobs.service'
import { normalizeCompanyName } from './company-directory'

type Repositories = ReturnType<typeof createRepositories>
type JobsService = ReturnType<typeof createJobsService>
export interface BrowserCaptureInput {
  companyId?: string
  companyName: string
  title: string
  city?: string | null
  jobCode?: string | null
  deadline?: string | null
  requirements?: string | null
  url: string
  pageTitle?: string | null
  jdText?: string | null
  allowDuplicate?: boolean
}

export function createBrowserCaptureService(
  db: Database.Database,
  repositories: Repositories,
  jobs: JobsService,
) {
  return {
    capture(input: BrowserCaptureInput) {
      return db.transaction(() => {
        let companyId = input.companyId
        if (companyId && !repositories.companies.get(companyId))
          throw new Error('所选公司不存在，请刷新公司列表后重试')

        if (!companyId) {
          const target = normalizeCompanyName(input.companyName)
          const candidates = (
            db.prepare('SELECT id,name FROM companies').all() as Array<{ id: string; name: string }>
          ).filter((company) => normalizeCompanyName(company.name) === target)
          if (candidates.length > 1) throw new Error('找到多个同名公司，请在收录表单中选择具体公司后重试')
          companyId = candidates[0]?.id
        }

        const duplicates = jobs.findDuplicates({
          title: input.title,
          ...(companyId ? { companyId } : {}),
          url: input.url,
        })
        if (duplicates.length && !input.allowDuplicate)
          return { kind: 'duplicates' as const, matches: duplicates }

        if (!companyId) companyId = repositories.companies.create({ name: input.companyName.trim() }).id
        const created = jobs.create(
          {
            companyId,
            title: input.title.trim(),
            city: input.city ?? undefined,
            jobCode: input.jobCode ?? undefined,
            deadline: input.deadline ?? undefined,
            requirements: input.requirements ?? undefined,
            url: input.url,
            source: '投递浏览器',
            pageTitle: input.pageTitle ?? undefined,
            jdText: input.jdText ?? undefined,
          },
          { allowDuplicate: Boolean(input.allowDuplicate) },
        )
        return { kind: 'created' as const, ...created }
      })()
    },
  }
}
