import { describe, expect, it, vi } from 'vitest'
import { createBrowserManager, type BrowserViewPort } from '../../electron/browser/browser-manager'

function fakeView(): BrowserViewPort & {
  loads: string[]
  destroyed: boolean
  bounds: { x: number; y: number; width: number; height: number }
} {
  const listeners = new Set<() => void>()
  const view = {
    url: 'about:blank',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null as string | null,
    loads: [] as string[],
    destroyed: false,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    openHandler: (url: string) => {
      void url
    },
    async loadURL(url: string) {
      this.loads.push(url)
      this.url = url
      this.title = url
      listeners.forEach((listener) => listener())
    },
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    setBounds(bounds: { x: number; y: number; width: number; height: number }) {
      this.bounds = bounds
    },
    onStateChanged(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setOpenHandler(handler: (url: string) => void) {
      this.openHandler = handler
    },
    destroy() {
      this.destroyed = true
    },
  }
  return view
}

describe('browser manager', () => {
  it('owns tab lifecycle and only gives bounds to the active remote view', async () => {
    const views: Array<ReturnType<typeof fakeView>> = []
    const manager = createBrowserManager({
      createView: () => {
        const view = fakeView()
        views.push(view)
        return view
      },
    })

    const first = await manager.openTab('jobs.example.com/one')
    const second = await manager.openTab('https://jobs.example.com/two')
    manager.setBounds({ x: 40, y: 140, width: 900, height: 700 })

    expect(manager.getState().tabs.map((tab) => tab.url)).toEqual([
      'https://jobs.example.com/one',
      'https://jobs.example.com/two',
    ])
    expect(views[0].bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(views[1].bounds).toEqual({ x: 40, y: 140, width: 900, height: 700 })

    manager.activateTab(first)
    expect(views[0].bounds).toEqual({ x: 40, y: 140, width: 900, height: 700 })
    expect(views[1].bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    manager.closeTab(first)
    expect(views[0].destroyed).toBe(true)
    expect(manager.getState().activeTabId).toBe(second)
  })

  it('rejects an unsafe address without navigating and routes a popup into a managed tab', async () => {
    const views: Array<ReturnType<typeof fakeView>> = []
    const manager = createBrowserManager({
      createView: () => {
        const view = fakeView()
        views.push(view)
        return view
      },
    })
    const tabId = await manager.openTab('careers.example.com')

    expect((await manager.navigate(tabId, 'javascript:alert(1)')).kind).toBe('error')
    expect(views[0].loads).toEqual(['https://careers.example.com/'])
    views[0].openHandler('https://careers.example.com/job/2')

    expect(manager.getState().tabs).toHaveLength(2)
    expect(manager.getState().tabs[1].url).toBe('https://careers.example.com/job/2')
  })

  it('routes navigation controls only to the active tab and preserves an empty geometry when hidden', async () => {
    const views: Array<ReturnType<typeof fakeView>> = []
    const manager = createBrowserManager({
      createView: () => {
        const view = fakeView()
        views.push(view)
        return view
      },
    })
    const first = await manager.openTab('https://jobs.example.com/one')
    const second = await manager.openTab('https://jobs.example.com/two')
    views[1].canGoBack = true
    views[1].canGoForward = true

    manager.goBack()
    manager.goForward()
    manager.reload()
    expect(views[0].goBack).not.toHaveBeenCalled()
    expect(views[1].goBack).toHaveBeenCalledOnce()
    expect(views[1].goForward).toHaveBeenCalledOnce()
    expect(views[1].reload).toHaveBeenCalledOnce()

    manager.activateTab(first)
    manager.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    expect(views[0].bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(views[1].bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    manager.dispose()
    expect(manager.getState()).toEqual({ tabs: [], activeTabId: null })
    expect(views.every((view) => view.destroyed)).toBe(true)
    expect(second).toBeTruthy()
  })
})
