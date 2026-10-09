import type Database from 'better-sqlite3'

export interface SaveCareerSiteInput {
  companyId?: string | null
  name: string
  url: string
  kind: 'COMPANY' | 'CAREERS'
}

interface BrowserSiteWriter {
  saveSite(input: SaveCareerSiteInput): unknown
}

interface CompanyUrlWriter {
  get(id: string): unknown
  update(id: string, input: { careersUrl?: string; website?: string }): unknown
}

export function createSavedSiteService(
  database: Database.Database,
  browserSites: BrowserSiteWriter,
  companies: CompanyUrlWriter,
) {
  return {
    save(input: SaveCareerSiteInput) {
      return database.transaction(() => {
        if (input.companyId && !companies.get(input.companyId)) throw new Error('没有找到关联公司')
        const site = browserSites.saveSite(input)
        if (input.companyId) {
          const companyUrl = input.kind === 'CAREERS' ? { careersUrl: input.url } : { website: input.url }
          companies.update(input.companyId, companyUrl)
        }
        return site
      })()
    },
  }
}
