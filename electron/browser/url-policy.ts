const SEARCH_URL = 'https://www.bing.com/search?q='
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i
const DOMAIN_PATTERN = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d-]{2,}(?::\d+)?(?:\/|$)/i

export type BrowserInputResolution =
  { kind: 'navigate'; url: string } | { kind: 'search'; url: string } | { kind: 'error'; message: string }

export function resolveBrowserInput(rawValue: string): BrowserInputResolution {
  const value = rawValue.trim()
  if (!value) return { kind: 'error', message: '请输入网址或搜索内容' }

  if (SCHEME_PATTERN.test(value) && !/^https:\/\//i.test(value)) {
    return { kind: 'error', message: '为保护账号安全，浏览器只允许 HTTPS 网站' }
  }

  if (/^https:\/\//i.test(value) || DOMAIN_PATTERN.test(value)) {
    const url = parseSecureUrl(/^https:\/\//i.test(value) ? value : `https://${value}`)
    return url ? { kind: 'navigate', url } : { kind: 'error', message: '网址无效或包含不安全内容' }
  }

  return { kind: 'search', url: `${SEARCH_URL}${encodeURIComponent(value)}` }
}

export function isAllowedBrowserNavigation(value: string): boolean {
  return parseSecureUrl(value) !== undefined
}

function parseSecureUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
