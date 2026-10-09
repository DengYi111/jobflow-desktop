import type { BrowserViewPort } from './browser-manager'

type BrowserSessionStorage = {
  clearStorageData(): Promise<void>
  clearCache(): Promise<void>
}

export async function clearBrowserSession(
  session: BrowserSessionStorage,
  views: Iterable<Pick<BrowserViewPort, 'reload'>>,
): Promise<void> {
  await session.clearStorageData()
  await session.clearCache()
  for (const view of views) view.reload()
}
