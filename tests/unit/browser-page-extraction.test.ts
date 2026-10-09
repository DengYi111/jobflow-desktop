import { describe, expect, it } from 'vitest'
import { extractBrowserJob } from '../../src/renderer/features/browser/page-extraction'

describe('browser job extraction', () => {
  it('extracts common job metadata and associates a saved company site', () => {
    const result = extractBrowserJob(
      {
        title: '嵌入式工程师 - 星河科技校园招聘',
        url: 'https://jobs.stars.example/role/42',
        text: '星河科技\n岗位编号：FW-42\n工作地点：武汉\n投递截止日期：2026年10月31日\n负责设备软件开发',
      },
      [{ id: 'company', name: '星河科技', careersUrl: null, website: null }],
      [{ url: 'https://jobs.stars.example/', companyName: '星河科技' }],
    )
    expect(result).toEqual({
      companyName: '星河科技',
      title: '嵌入式工程师',
      city: '武汉',
      jobCode: 'FW-42',
      deadline: '2026-10-31',
      requirements: expect.stringContaining('负责设备软件开发'),
    })
  })

  it('does not invent a company when page text has no company marker', () => {
    const result = extractBrowserJob(
      { title: '嵌入式软件开发', url: 'https://careers.example.org/job', text: '岗位职责\n负责驱动程序开发' },
      [],
      [],
    )
    expect(result.companyName).toBe('')
    expect(result.title).toBe('嵌入式软件开发')
  })
})
