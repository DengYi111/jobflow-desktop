import { describe, expect, it } from 'vitest'
import { isAllowedBrowserNavigation, resolveBrowserInput } from '../../electron/browser/url-policy'

describe('browser URL policy', () => {
  it('navigates to a complete HTTPS URL without changing its path', () => {
    expect(resolveBrowserInput('https://careers.example.com/jobs/42?from=campus')).toEqual({
      kind: 'navigate',
      url: 'https://careers.example.com/jobs/42?from=campus',
    })
  })

  it('adds HTTPS to a bare recruitment domain', () => {
    expect(resolveBrowserInput('careers.example.com/jobs/42')).toEqual({
      kind: 'navigate',
      url: 'https://careers.example.com/jobs/42',
    })
  })

  it('searches ordinary text instead of treating it as a URL', () => {
    expect(resolveBrowserInput('小米 校园招聘')).toEqual({
      kind: 'search',
      url: 'https://www.bing.com/search?q=%E5%B0%8F%E7%B1%B3%20%E6%A0%A1%E5%9B%AD%E6%8B%9B%E8%81%98',
    })
  })

  it.each([
    'http://careers.example.com',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///C:/secret',
    'https://user:pass@example.com',
  ])('rejects unsafe URL %s', (value) => {
    expect(resolveBrowserInput(value).kind).toBe('error')
    expect(isAllowedBrowserNavigation(value)).toBe(false)
  })

  it('blocks a later insecure navigation even after an HTTPS page was loaded', () => {
    expect(isAllowedBrowserNavigation('https://careers.example.com/next')).toBe(true)
    expect(isAllowedBrowserNavigation('http://careers.example.com/next')).toBe(false)
  })
})
