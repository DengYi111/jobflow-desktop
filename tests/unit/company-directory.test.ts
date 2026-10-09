import { describe, expect, it } from 'vitest'
import {
  loadCompanyDirectory,
  normalizeCompanyName,
  searchCompanyDirectory,
  validateCompanyDirectory,
} from '../../src/main/services/company-directory'
import { companyIndustryDefinitions } from '../../src/shared/constants/company-industries'

describe('offline company directory', () => {
  it('ships about 300 entries with unique IDs and valid industry references', () => {
    const directory = loadCompanyDirectory()
    expect(directory.companies.length).toBeGreaterThanOrEqual(280)
    expect(directory.companies.length).toBeLessThanOrEqual(320)
    expect(new Set(directory.companies.map((company) => company.id)).size).toBe(directory.companies.length)
    expect(new Set(directory.industries.map((industry) => industry.id)).size).toBe(
      directory.industries.length,
    )
    const industryIds = new Set(directory.industries.map((industry) => industry.id))
    expect(directory.companies.every((company) => industryIds.has(company.industryId))).toBe(true)
    expect(directory.industries).toHaveLength(18)
    expect(directory.industries).toEqual(companyIndustryDefinitions)
  })

  it('searches company names and aliases without case or whitespace sensitivity', () => {
    expect(searchCompanyDirectory({ query: '  tencent  ' }).map((company) => company.name)).toContain(
      '腾讯控股',
    )
    expect(searchCompanyDirectory({ query: '微信' }).map((company) => company.name)).toContain('腾讯控股')
  })

  it('filters search results by industry', () => {
    const results = searchCompanyDirectory({ industryId: 'internet-software' })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((company) => company.industryId === 'internet-software')).toBe(true)
  })

  it('normalizes unicode, punctuation, whitespace, case, and recognized legal suffixes', () => {
    expect(normalizeCompanyName('  ＡＣＭＥ　科技股份有限公司  ')).toBe(normalizeCompanyName('ACME科技'))
    expect(normalizeCompanyName('Tencent Holdings Ltd.')).toBe(normalizeCompanyName('tencent holdings'))
  })

  it('rejects ambiguous aliases across different company records', () => {
    expect(() =>
      validateCompanyDirectory({
        version: 1,
        updatedAt: '2026-09-24',
        sources: [{ name: '测试来源', url: 'https://example.com', retrievedAt: '2026-09-24' }],
        industries: [{ id: 'software', nameZh: '软件与互联网' }],
        companies: [
          { id: 'alpha', name: '甲科技', aliases: ['共同简称'], industryId: 'software' },
          { id: 'beta', name: '乙科技', aliases: ['共同简称'], industryId: 'software' },
        ],
      }),
    ).toThrow('公司目录存在重复名称或别名')
  })
})
