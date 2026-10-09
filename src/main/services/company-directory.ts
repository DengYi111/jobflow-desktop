import { z } from 'zod'
import bundledDirectory from '../data/company-directory.json'

const sourceSchema = z
  .object({ name: z.string().min(1), url: z.string().url(), retrievedAt: z.string().date() })
  .strict()
const industrySchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), nameZh: z.string().min(1) }).strict()
const companySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(200),
    aliases: z.array(z.string().trim().min(1).max(200)),
    industryId: z.string().regex(/^[a-z0-9-]+$/),
  })
  .strict()
const directorySchema = z
  .object({
    version: z.number().int().positive(),
    updatedAt: z.string().date(),
    sources: z.array(sourceSchema).min(1),
    industries: z.array(industrySchema).min(1),
    companies: z.array(companySchema).min(1),
  })
  .strict()

export type CompanyDirectoryEntry = z.infer<typeof companySchema>
export type CompanyDirectoryIndustry = z.infer<typeof industrySchema>
export type CompanyDirectory = z.infer<typeof directorySchema>

const legalSuffixes = [
  '股份有限公司',
  '有限责任公司',
  '集团有限公司',
  '有限公司',
  '股份公司',
  '集团',
  'incorporated',
  'inc',
  'corporation',
  'corp',
  'limited',
  'ltd',
  'company',
  'co',
]

export function normalizeCompanyName(name: string): string {
  let normalized = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
  for (const suffix of legalSuffixes) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(?:[,，.。\\s]+)?${escaped}[.。]?\\s*$`, 'iu')
    const next = normalized.replace(pattern, '').trim()
    if (next !== normalized) {
      normalized = next
      break
    }
  }
  return normalized.replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function validateCompanyDirectory(input: unknown): CompanyDirectory {
  const parsed = directorySchema.parse(input)
  const industryIds = new Set(parsed.industries.map((industry) => industry.id))
  if (industryIds.size !== parsed.industries.length) throw new Error('公司目录存在重复行业 ID')
  if (new Set(parsed.companies.map((company) => company.id)).size !== parsed.companies.length)
    throw new Error('公司目录存在重复公司 ID')
  for (const company of parsed.companies) {
    if (!industryIds.has(company.industryId)) throw new Error(`公司「${company.name}」引用了未知行业`)
  }
  const normalizedNames = new Map<string, string>()
  for (const company of parsed.companies) {
    for (const label of [company.name, ...company.aliases]) {
      const normalized = normalizeCompanyName(label)
      const previousId = normalizedNames.get(normalized)
      if (!normalized || (previousId && previousId !== company.id))
        throw new Error('公司目录存在重复名称或别名')
      normalizedNames.set(normalized, company.id)
    }
  }
  return parsed
}

let validatedDirectory: CompanyDirectory | undefined
export function loadCompanyDirectory(): CompanyDirectory {
  if (!validatedDirectory) {
    try {
      validatedDirectory = validateCompanyDirectory(bundledDirectory)
    } catch (error) {
      throw new Error(`公司目录加载失败：${error instanceof Error ? error.message : '目录格式无效'}`)
    }
  }
  return validatedDirectory
}

export function searchCompanyDirectory(
  input: { query?: string; industryId?: string } = {},
): CompanyDirectoryEntry[] {
  const directory = loadCompanyDirectory()
  const query = normalizeCompanyName(input.query ?? '')
  if (input.industryId && !directory.industries.some((industry) => industry.id === input.industryId))
    throw new Error('所选行业不存在')
  return directory.companies.filter((company) => {
    if (input.industryId && company.industryId !== input.industryId) return false
    return (
      !query ||
      [company.name, ...company.aliases].some((label) => normalizeCompanyName(label).includes(query))
    )
  })
}
