const SEARCH_URL = 'https://www.bing.com/search?q='
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i
const DOMAIN_PATTERN = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z\d-]{2,}(?::\d+)?(?:\/|$)/i

export type BrowserInputResolution =
  { kind: 'navigate'; url: string } | { kind: 'search'; url: string } | { kind: 'error'; message: string }

export function resolveBrowserInput(rawValue: string): BrowserInputResolution {
  const value = rawValue.trim()
  if (!value) return { kind: 'error', message: '请输入网址或搜索内容' }

  const hasHttpScheme = /^https?:\/\//i.test(value)
  if (SCHEME_PATTERN.test(value) && !hasHttpScheme) {
    return { kind: 'error', message: '浏览器仅允许 HTTP 或 HTTPS 网站' }
  }

  if (hasHttpScheme || DOMAIN_PATTERN.test(value)) {
    const url = parseBrowserUrl(hasHttpScheme ? value : `https://${value}`)
    return url ? { kind: 'navigate', url } : { kind: 'error', message: '网址无效或包含不安全内容' }
  }

  return { kind: 'search', url: `${SEARCH_URL}${encodeURIComponent(value)}` }
}

export function isAllowedBrowserNavigation(value: string): boolean {
  return parseBrowserUrl(value) !== undefined
}

function parseBrowserUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
      return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
