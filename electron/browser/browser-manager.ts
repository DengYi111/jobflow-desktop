import { isAllowedBrowserNavigation, resolveBrowserInput } from './url-policy'

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserViewPort {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
  loadURL(url: string): Promise<void>
  goBack(): void
  goForward(): void
  reload(): void
  setBounds(bounds: BrowserBounds): void
  onStateChanged(listener: () => void): () => void
  setOpenHandler(handler: (url: string) => void): void
  destroy(): void
}

export interface BrowserTabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}

interface ManagedTab {
  id: string
  view: BrowserViewPort
  unsubscribe: () => void
}
interface BrowserManagerOptions {
  createView: () => BrowserViewPort
  onChanged?: (state: BrowserState) => void
  onViewCreated?: (id: string, view: BrowserViewPort) => void
  onViewDestroyed?: (id: string) => void
}
export interface BrowserState {
  tabs: BrowserTabState[]
  activeTabId: string | null
}

const hiddenBounds: BrowserBounds = { x: 0, y: 0, width: 0, height: 0 }

export function createBrowserManager({
  createView,
  onChanged,
  onViewCreated,
  onViewDestroyed,
}: BrowserManagerOptions) {
  const tabs = new Map<string, ManagedTab>()
  let activeTabId: string | null = null
  let bounds = hiddenBounds

  function getState(): BrowserState {
    return {
      activeTabId,
      tabs: [...tabs.values()].map(({ id, view }) => ({
        id,
        url: view.url,
        title: view.title,
        loading: view.loading,
        canGoBack: view.canGoBack,
        canGoForward: view.canGoForward,
        error: view.error,
      })),
    }
  }

  function publish() {
    onChanged?.(getState())
  }

  function syncBounds() {
    for (const { id, view } of tabs.values()) view.setBounds(id === activeTabId ? bounds : hiddenBounds)
  }

  async function openTab(input: string): Promise<string> {
    const resolution = resolveBrowserInput(input)
    if (resolution.kind === 'error') throw new Error(resolution.message)
    const id = crypto.randomUUID()
    const view = createView()
    const tab: ManagedTab = { id, view, unsubscribe: () => undefined }
    tabs.set(id, tab)
    onViewCreated?.(id, view)
    tab.unsubscribe = view.onStateChanged(publish)
    view.setOpenHandler((url) => {
      if (isAllowedBrowserNavigation(url)) void openTab(url).catch(() => undefined)
    })
    activeTabId = id
    syncBounds()
    publish()
    await view.loadURL(resolution.url)
    publish()
    return id
  }

  function activateTab(id: string): void {
    if (!tabs.has(id)) return
    activeTabId = id
    syncBounds()
    publish()
  }

  function closeTab(id: string): void {
    const tab = tabs.get(id)
    if (!tab) return
    tab.unsubscribe()
    tab.view.setBounds(hiddenBounds)
    tab.view.destroy()
    tabs.delete(id)
    onViewDestroyed?.(id)
    if (activeTabId === id) activeTabId = [...tabs.keys()].slice(-1)[0] ?? null
    syncBounds()
    publish()
  }

  async function navigate(id: string, input: string) {
    const tab = tabs.get(id)
    if (!tab) return { kind: 'error' as const, message: '标签页已关闭' }
    const resolution = resolveBrowserInput(input)
    if (resolution.kind === 'error') return resolution
    await tab.view.loadURL(resolution.url)
    publish()
    return { kind: resolution.kind, url: resolution.url }
  }

  function withActive(operation: 'back' | 'forward' | 'reload') {
    const view = activeTabId ? tabs.get(activeTabId)?.view : undefined
    if (!view) return
    if (operation === 'back' && view.canGoBack) view.goBack()
    if (operation === 'forward' && view.canGoForward) view.goForward()
    if (operation === 'reload') view.reload()
  }

  return {
    getState,
    getActiveTabId: () => activeTabId,
    openTab,
    activateTab,
    closeTab,
    navigate,
    goBack: () => withActive('back'),
    goForward: () => withActive('forward'),
    reload: () => withActive('reload'),
    setBounds(nextBounds: BrowserBounds) {
      bounds = nextBounds
      syncBounds()
    },
    dispose() {
      for (const id of [...tabs.keys()]) closeTab(id)
    },
  }
}
