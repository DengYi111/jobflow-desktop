import type { BrowserWindow, Session } from 'electron'
import type {
  BrowserFillFieldsInput,
  BrowserFormField,
  BrowserInspectFormInput,
  BrowserState,
  BrowserUploadResumeInput,
} from '../../src/shared/contracts/api'
import type { createBrowserRepository } from '../../src/main/repositories/browser.repository'
import { createBrowserManager, type BrowserBounds, type BrowserViewPort } from './browser-manager'
import { createElectronBrowserView } from './electron-browser-view'
import { isAllowedBrowserNavigation } from './url-policy'
import { clearBrowserSession } from './clear-browser-session'

type BrowserRepository = ReturnType<typeof createBrowserRepository>
type CapturePage = () => Promise<{ title: string; url: string; text: string }>
type RemoteBrowserView = BrowserViewPort & {
  capturePage: CapturePage
  inspectForm: (counts: BrowserInspectFormInput) => Promise<BrowserFormField[]>
  fillFields: (fields: BrowserFillFieldsInput['fields']) => Promise<{ filled: number }>
  uploadResume: (
    input: BrowserUploadResumeInput,
    temporaryDirectory: string,
  ) => Promise<{ uploaded: boolean }>
  fillFocusedField: (value: string) => Promise<{ filled: boolean }>
}

export function createElectronBrowserController(
  window: BrowserWindow,
  browserSession: Session,
  repository: BrowserRepository,
  temporaryDirectory: string,
) {
  const views = new Map<string, RemoteBrowserView>()
  let restoring = true
  let closing = false
  const manager = createBrowserManager({
    createView: () => {
      const view = createElectronBrowserView(browserSession, window, temporaryDirectory, (url, title) => {
        if (isAllowedBrowserNavigation(url)) repository.recordVisit({ url, title })
      })
      return view
    },
    onViewCreated: (id, view) => {
      views.set(id, view as RemoteBrowserView)
    },
    onViewDestroyed: (id) => {
      views.delete(id)
    },
    onChanged: (state) => {
      const safeTabs = state.tabs.filter((tab) => isAllowedBrowserNavigation(tab.url))
      if (!restoring && !closing)
        repository.saveTabState({
          tabs: safeTabs.map((tab) => tab.url),
          activeIndex: safeTabs.findIndex((tab) => tab.id === state.activeTabId),
        })
      if (!window.isDestroyed()) window.webContents.send('jobflow:browser.state', state)
    },
  })

  const saved = repository.getTabState()
  const ready = (async () => {
    const restoredIds: string[] = []
    for (const url of saved.tabs) {
      if (!isAllowedBrowserNavigation(url)) continue
      try {
        restoredIds.push(await manager.openTab(url))
      } catch {
        /* A failed site should not prevent the other tabs from restoring. */
      }
    }
    if (restoredIds.length)
      manager.activateTab(restoredIds[Math.min(Math.max(saved.activeIndex, 0), restoredIds.length - 1)])
    restoring = false
    const state = manager.getState()
    repository.saveTabState({
      tabs: state.tabs.map((tab) => tab.url),
      activeIndex: state.tabs.findIndex((tab) => tab.id === state.activeTabId),
    })
  })()

  function getState(): BrowserState {
    return manager.getState() as BrowserState
  }
  function requireTab(id: string) {
    const tab = getState().tabs.find((item) => item.id === id)
    if (!tab) throw new Error('浏览器标签页已关闭')
    return tab
  }

  return {
    ready,
    getState,
    async openTab(input: string) {
      return { id: await manager.openTab(input) }
    },
    activateTab({ id }: { id: string }) {
      requireTab(id)
      manager.activateTab(id)
    },
    closeTab({ id }: { id: string }) {
      manager.closeTab(id)
    },
    async navigate({ id, value }: { id: string; value: string }) {
      requireTab(id)
      const result = await manager.navigate(id, value)
      if (result.kind === 'error') throw new Error(result.message)
    },
    back() {
      manager.goBack()
    },
    forward() {
      manager.goForward()
    },
    reload() {
      manager.reload()
    },
    setBounds(input: BrowserBounds) {
      const { width: maxWidth, height: maxHeight } = window.getContentBounds()
      const x = Math.floor(Math.min(input.x, maxWidth))
      const y = Math.floor(Math.min(input.y, maxHeight))
      manager.setBounds({
        x,
        y,
        width: Math.floor(Math.min(input.width, maxWidth - x)),
        height: Math.floor(Math.min(input.height, maxHeight - y)),
      })
    },
    async capturePage() {
      const id = manager.getActiveTabId()
      const view = id ? views.get(id) : undefined
      if (!view?.capturePage) throw new Error('请先打开招聘网页')
      const page = await view.capturePage()
      if (!isAllowedBrowserNavigation(page.url)) throw new Error('当前网页地址不安全，无法收录')
      return { ...page, text: page.text.slice(0, 50000) }
    },
    async inspectForm(counts: BrowserInspectFormInput) {
      const id = manager.getActiveTabId()
      const view = id ? views.get(id) : undefined
      if (!view?.inspectForm) throw new Error('请先打开招聘网页')
      if (!isAllowedBrowserNavigation(view.url)) throw new Error('当前网页地址不安全，无法读取表单')
      return view.inspectForm(counts)
    },
    async fillProfileFields({ fields }: BrowserFillFieldsInput) {
      const id = manager.getActiveTabId()
      const view = id ? views.get(id) : undefined
      if (!view?.fillFields) throw new Error('请先打开招聘网页')
      if (!isAllowedBrowserNavigation(view.url)) throw new Error('当前网页地址不安全，无法填写表单')
      return view.fillFields(fields)
    },
    async fillFocusedField({ value }: { value: string }) {
      const id = manager.getActiveTabId()
      const view = id ? views.get(id) : undefined
      if (!view?.fillFocusedField) throw new Error('请先打开招聘网页')
      if (!isAllowedBrowserNavigation(view.url)) throw new Error('当前网页地址不安全，无法填写表单')
      return view.fillFocusedField(value)
    },
    async uploadResume(input: BrowserUploadResumeInput) {
      const id = manager.getActiveTabId()
      const view = id ? views.get(id) : undefined
      if (!view?.uploadResume) throw new Error('请先打开招聘网页')
      if (!isAllowedBrowserNavigation(view.url)) throw new Error('当前网页地址不安全，无法上传简历')
      return view.uploadResume(input, temporaryDirectory)
    },
    listSites({ query }: { query?: string } = {}) {
      return repository.listSites(query)
    },
    saveSite(input: { companyId?: string | null; name: string; url: string; kind: 'COMPANY' | 'CAREERS' }) {
      if (!isAllowedBrowserNavigation(input.url)) throw new Error('招聘官网必须使用 HTTPS 安全网址')
      return repository.saveSite(input)
    },
    deleteSite({ id }: { id: string }) {
      repository.deleteSite(id)
    },
    listHistory({ limit }: { limit?: number } = {}) {
      return repository.listHistory(limit)
    },
    clearHistory() {
      repository.clearHistory()
    },
    async clearSession() {
      await clearBrowserSession(browserSession, views.values())
      return undefined
    },
    listAutofillMappings({ hostname }: { hostname: string }) {
      return repository.listAutofillMappings(hostname)
    },
    saveAutofillMapping(input: { hostname: string; signature: string; sourceKey: string }) {
      repository.saveAutofillMapping(input)
    },
    dispose() {
      const state = manager.getState()
      const tabs = state.tabs.filter((tab) => isAllowedBrowserNavigation(tab.url))
      repository.saveTabState({
        tabs: tabs.map((tab) => tab.url),
        activeIndex: tabs.findIndex((tab) => tab.id === state.activeTabId),
      })
      closing = true
      manager.dispose()
      views.clear()
    },
  }
}

export type ElectronBrowserController = ReturnType<typeof createElectronBrowserController>
