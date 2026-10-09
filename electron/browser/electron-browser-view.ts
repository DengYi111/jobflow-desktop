import { WebContentsView, type BrowserWindow, type Session } from 'electron'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  BrowserFillFieldsInput,
  BrowserFormField,
  BrowserInspectFormInput,
} from '../../src/shared/contracts/api'
import type { BrowserUploadResumeInput } from '../../src/shared/contracts/api'
import type { BrowserBounds, BrowserViewPort } from './browser-manager'
import { isAllowedBrowserNavigation } from './url-policy'
import {
  createFillFocusedFieldScript,
  createFillFormScript,
  createInstallFocusedFieldTrackerScript,
  createInspectFormScript,
} from './page-forms'
import { createViewDisposer } from './view-disposal'

export function createElectronBrowserView(
  browserSession: Session,
  window: BrowserWindow,
  temporaryDirectory: string,
  onNavigated?: (url: string, title: string) => void,
): BrowserViewPort & {
  capturePage(): Promise<{ title: string; url: string; text: string }>
  inspectForm(counts: BrowserInspectFormInput): Promise<BrowserFormField[]>
  fillFields(fields: BrowserFillFieldsInput['fields']): Promise<{ filled: number }>
  uploadResume(input: BrowserUploadResumeInput): Promise<{ uploaded: boolean }>
  fillFocusedField(value: string): Promise<{ filled: boolean }>
} {
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  })
  window.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  const listeners = new Set<() => void>()
  let openHandler: (url: string) => void = () => undefined
  let error: string | null = null
  const changed = () => listeners.forEach((listener) => listener())
  const contents = view.webContents
  let fitTimer: ReturnType<typeof setTimeout> | undefined
  const pendingUploadFiles = new Set<string>()
  const clearPendingUploads = async () => {
    const files = [...pendingUploadFiles]
    pendingUploadFiles.clear()
    await Promise.all(files.map((file) => rm(file, { force: true }).catch(() => undefined)))
  }
  const fitPageWidth = async () => {
    if (contents.isDestroyed() || contents.isLoading() || view.getBounds().width <= 0) return
    try {
      contents.setZoomFactor(1)
      const pageWidth = await contents.executeJavaScript(
        `new Promise(resolve => requestAnimationFrame(() => resolve(Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0))))`,
      )
      const viewportWidth = view.getBounds().width
      if (typeof pageWidth !== 'number' || pageWidth <= 0) return
      contents.setZoomFactor(Math.min(1, Math.max(0.65, viewportWidth / pageWidth)))
    } catch {
      // Some pages block script execution while navigating; the page remains usable at normal zoom.
    }
  }
  const scheduleFit = () => {
    if (fitTimer) clearTimeout(fitTimer)
    fitTimer = setTimeout(() => void fitPageWidth(), 160)
  }
  const disposeView = createViewDisposer(
    () => window.isDestroyed(),
    () => contents.isDestroyed(),
    () => window.contentView.removeChildView(view),
    () => contents.close(),
  )

  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedBrowserNavigation(url)) openHandler(url)
    return { action: 'deny' }
  })
  const allowSecureNavigation = (event: Electron.Event, url: string) => {
    if (!isAllowedBrowserNavigation(url)) event.preventDefault()
  }
  contents.on('will-navigate', allowSecureNavigation)
  contents.on('will-redirect', allowSecureNavigation)
  contents.on('did-start-loading', () => {
    setTimeout(() => void clearPendingUploads(), 5000)
    error = null
    changed()
  })
  contents.on('did-stop-loading', changed)
  contents.on('page-title-updated', changed)
  contents.on('did-navigate', changed)
  contents.on('did-finish-load', () => {
    onNavigated?.(contents.getURL(), contents.getTitle())
    void contents.executeJavaScript(createInstallFocusedFieldTrackerScript()).catch(() => undefined)
    scheduleFit()
    changed()
  })
  contents.on('did-navigate-in-page', changed)
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) error = description || `网页加载失败（${code}）`
    changed()
  })
  contents.on('render-process-gone', () => {
    error = '网页进程已退出，请重新加载'
    changed()
  })

  return {
    get url() {
      return contents.getURL()
    },
    get title() {
      return contents.getTitle() || contents.getURL()
    },
    get loading() {
      return contents.isLoading()
    },
    get canGoBack() {
      return contents.navigationHistory.canGoBack()
    },
    get canGoForward() {
      return contents.navigationHistory.canGoForward()
    },
    get error() {
      return error
    },
    async loadURL(url: string) {
      error = null
      await contents.loadURL(url)
    },
    goBack() {
      contents.navigationHistory.goBack()
    },
    goForward() {
      contents.navigationHistory.goForward()
    },
    reload() {
      contents.reload()
    },
    setBounds(bounds: BrowserBounds) {
      view.setBounds(bounds)
      if (bounds.width > 0 && bounds.height > 0) scheduleFit()
    },
    onStateChanged(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setOpenHandler(handler: (url: string) => void) {
      openHandler = handler
    },
    destroy() {
      if (fitTimer) clearTimeout(fitTimer)
      void clearPendingUploads()
      disposeView()
      listeners.clear()
    },
    capturePage: () =>
      contents.executeJavaScript(
        `(() => ({ title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 50000) ?? '' }))()`,
      ),
    inspectForm: (counts: BrowserInspectFormInput) =>
      contents.executeJavaScript(createInspectFormScript(counts)),
    fillFields: (fields) => contents.executeJavaScript(createFillFormScript(fields)),
    async uploadResume(input) {
      const attachedHere = !contents.debugger.isAttached()
      if (attachedHere) contents.debugger.attach('1.3')
      let filePath: string | undefined
      try {
        const safeName =
          path
            .basename(input.fileName)
            .replace(/[^\p{L}\p{N}._-]+/gu, '_')
            .slice(-100) || 'resume.pdf'
        filePath = path.join(temporaryDirectory, `jobflow-${randomUUID()}-${safeName}`)
        const pdf = Buffer.from(input.base64, 'base64')
        if (pdf.length > 25 * 1024 * 1024 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-')
          throw new Error('简历必须是有效的 PDF，且不超过 25 MB')
        await mkdir(temporaryDirectory, { recursive: true })
        await writeFile(filePath, pdf, { flag: 'wx', mode: 0o600 })
        const { root } = (await contents.debugger.sendCommand('DOM.getDocument', { depth: 0 })) as {
          root: { nodeId: number }
        }
        const selector = `[data-jobflow-autofill-index="${input.index}"][data-jobflow-autofill-signature="${input.signature.replace(/["\\]/g, '\\$&')}"]`
        const { nodeId } = (await contents.debugger.sendCommand('DOM.querySelector', {
          nodeId: root.nodeId,
          selector,
        })) as { nodeId: number }
        if (!nodeId) throw new Error('网页简历上传控件已变化，请重新扫描')
        await contents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [filePath] })
        pendingUploadFiles.add(filePath)
        filePath = undefined
        return { uploaded: true }
      } catch (error) {
        if (filePath) await rm(filePath, { force: true }).catch(() => undefined)
        throw error
      } finally {
        if (attachedHere && contents.debugger.isAttached()) contents.debugger.detach()
      }
    },
    fillFocusedField: (value) => contents.executeJavaScript(createFillFocusedFieldScript(value)),
  }
}
