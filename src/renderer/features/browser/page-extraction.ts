import type { BrowserPageCapture, CompanySummary } from '../../../shared/contracts/api'

export interface CompanySiteHint {
  url: string
  companyName?: string
}
export interface ExtractedBrowserJob {
  companyName: string
  title: string
  city: string
  jobCode: string
  deadline: string
  requirements: string
}

export function extractBrowserJob(
  page: BrowserPageCapture,
  companies: CompanySummary[],
  sites: CompanySiteHint[],
): ExtractedBrowserJob {
  const host = safeHostname(page.url)
  const matchingSite = host ? sites.find((site) => safeHostname(site.url) === host) : undefined
  return {
    companyName: matchingSite?.companyName ?? findCompany(page, companies) ?? extractCompany(page.text),
    title: extractTitle(page.title, companies),
    city:
      page.text.match(/(?:工作地点|工作城市|招聘城市|地点)\s*[:：]?\s*([^\n，,；;]{2,30})/)?.[1]?.trim() ??
      '',
    jobCode:
      page.text
        .match(/(?:岗位编号|职位编号|职位ID|Job\s*ID)\s*[:：]?\s*([A-Za-z0-9_-]{3,40})/i)?.[1]
        ?.trim() ?? '',
    deadline:
      page.text
        .match(
          /(?:投递截止|截止日期|申请截止|报名截止)(?:日期|时间)?\s*[:：]?\s*(20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?)/,
        )?.[1]
        ?.replace(/[年月/.]/g, '-')
        .replace(/日$/, '') ?? '',
    requirements: page.text.slice(0, 20000),
  }
}

function extractTitle(title: string, companies: CompanySummary[]) {
  const parts = title.split(/[-_|｜—]/).map((part) => part.trim())
  const candidates = parts
    .map((part) =>
      companies
        .reduce((text, company) => text.split(company.name).join(''), part)
        .replace(/招聘|官网|校招|社会招聘|校园招聘/g, '')
        .trim(),
    )
    .filter(Boolean)
  return (
    candidates.sort((left, right) => right.length - left.length)[0] ??
    title.replace(/招聘|官网|校招/g, '').trim()
  )
}

function findCompany(page: BrowserPageCapture, companies: CompanySummary[]) {
  const heading = `${page.title}\n${page.text.slice(0, 3000)}`
  return companies.find((company) => company.name && heading.includes(company.name))?.name
}

function extractCompany(text: string) {
  return (
    text
      .slice(0, 3000)
      .match(/(?:公司名称|企业名称|招聘单位|用人单位)\s*[:：]?\s*([^\n，,；;]{2,60})/)?.[1]
      ?.trim() ?? ''
  )
}

function safeHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLocaleLowerCase('en-US')
  } catch {
    return undefined
  }
}
