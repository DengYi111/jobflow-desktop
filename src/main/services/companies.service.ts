import type Database from 'better-sqlite3'
import { createRepositories } from '../repositories'
import { loadCompanyDirectory, normalizeCompanyName, searchCompanyDirectory } from './company-directory'

export function createCompaniesService(
  db: Database.Database,
  repositories: ReturnType<typeof createRepositories>,
) {
  return {
    list(input: { query?: string; industryId?: string } = {}) {
      return repositories.companies.list(input.query, input.industryId)
    },
    listDirectory(input: { query?: string; industryId?: string } = {}) {
      const directory = loadCompanyDirectory()
      const linkedCompanies = new Map(
        (repositories.companies.listDirectoryLinks() as Array<Record<string, unknown>>).map((company) => [
          String(company.directoryId),
          company,
        ]),
      )
      const industryNames = new Map(directory.industries.map((industry) => [industry.id, industry.nameZh]))
      return {
        industries: directory.industries,
        companies: searchCompanyDirectory(input).map((entry) => ({
          ...entry,
          industryName: industryNames.get(entry.industryId) ?? entry.industryId,
          localCompany: linkedCompanies.get(entry.id) ?? null,
        })),
      }
    },
    addFromDirectory(input: { directoryId: string }) {
      const entry = loadCompanyDirectory().companies.find((company) => company.id === input.directoryId)
      if (!entry) throw new Error('公司目录中找不到此公司')
      return db.transaction(() => {
        const linked = repositories.companies.findByDirectoryId(entry.id) as
          Record<string, unknown> | undefined
        if (linked)
          return linked.archivedAt
            ? repositories.companies.restoreDirectory(String(linked.id), entry.industryId)
            : linked
        const targetNames = new Set([entry.name, ...entry.aliases].map(normalizeCompanyName))
        const matches = (
          repositories.companies.listActiveForDirectoryMatch() as Array<Record<string, unknown>>
        ).filter((company) => targetNames.has(normalizeCompanyName(String(company.name))))
        if (matches.length > 1) {
          const names = matches.map((company) => String(company.name)).join('、')
          throw new Error(
            `COMPANY_MATCH_CONFLICT：找到多个可能对应的本地公司：${names}。请先整理公司档案后重试。`,
          )
        }
        if (matches.length === 1) {
          const match = matches[0]
          if (match.directoryId && match.directoryId !== entry.id)
            throw new Error(`COMPANY_MATCH_CONFLICT：公司「${String(match.name)}」已关联到其他目录条目。`)
          return repositories.companies.linkDirectory(String(match.id), entry.id, entry.industryId)
        }
        return repositories.companies.create({
          name: entry.name,
          industryId: entry.industryId,
          directoryId: entry.id,
        })
      })()
    },
    create(input: {
      name: string
      careersUrl?: string | null
      website?: string | null
      notes?: string | null
      industryId?: string | null
    }) {
      return repositories.companies.create(input)
    },
    update(input: {
      id: string
      name?: string
      careersUrl?: string | null
      website?: string | null
      notes?: string | null
      industryId?: string | null
    }) {
      const { id, ...fields } = input
      return repositories.companies.update(id, fields)
    },
    archive(id: string) {
      repositories.companies.archive(id)
    },
    get(id: string) {
      const company = repositories.companies.get(id) as Record<string, unknown> | undefined
      if (!company) return null
      return { ...company, jobs: repositories.companies.listJobs(id) }
    },
  }
}
