import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  Notification,
  protocol,
  session,
  shell,
} from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { registerHandlers } from '../src/main/ipc/register-handlers'
import { buildContentSecurityPolicy } from '../src/main/security/content-security-policy'
import { isTrustedNavigation } from '../src/main/security/navigation-policy'
import { installDenyAllPermissionPolicy } from '../src/main/security/session-permissions'
import { openDatabase } from '../src/main/db/open-database'
import { createNotificationScheduler } from '../src/main/services/notifications.service'
import { createChineseMenuTemplate } from './app-menu'
import {
  markDataMigrationComplete,
  prepareDataDirectory,
  resolveJobFlowDataDirectory,
  removeLegacyDataDirectory,
} from './data-directory'
import type Database from 'better-sqlite3'
import type {
  BrowserFillFieldsInput,
  BrowserInspectFormInput,
  BrowserUploadResumeInput,
} from '../src/shared/contracts/api'
import { createElectronBrowserController } from './browser/electron-browser-controller'
import { electronSecretProtector } from './security/electron-secret-protector'
import { migrateProfileProtection } from '../src/main/services/profile-protection-migration'
import { createLogger } from '../src/main/logging/logger'
import { createApplicationRuntime } from './app/create-runtime'
import { createSecureFileStore } from '../src/main/services/secure-file-store'
import { createSavedSiteService } from '../src/main/services/saved-sites.service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let database: Database.Database | undefined
let notificationScheduler: ReturnType<typeof createNotificationScheduler> | undefined
let browserController: ReturnType<typeof createElectronBrowserController> | undefined
let dataDirectoryPreparation: ReturnType<typeof prepareDataDirectory> | undefined
let dataDirectoryInitializationError: Error | undefined
const legacyUserDataDirectory = app.getPath('userData')
const JOBFLOW_DATA_DIRECTORY = resolveJobFlowDataDirectory(app.isPackaged, process.execPath)
const APP_ORIGIN = 'app://jobflow'
const logger = createLogger(path.join(JOBFLOW_DATA_DIRECTORY, 'logs'))

// Keep persistent data outside the install directory so application updates cannot replace it.
// In packaged builds it follows the selected install location; development keeps the E: workspace data.
try {
  dataDirectoryPreparation = prepareDataDirectory(JOBFLOW_DATA_DIRECTORY, legacyUserDataDirectory)
  mkdirSync(path.join(JOBFLOW_DATA_DIRECTORY, 'session-data'), { recursive: true })
  app.setPath('userData', JOBFLOW_DATA_DIRECTORY)
  app.setPath('sessionData', path.join(JOBFLOW_DATA_DIRECTORY, 'session-data'))
} catch (error) {
  dataDirectoryInitializationError = error instanceof Error ? error : new Error(String(error))
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  },
])

function trustedOrigin(): string {
  return VITE_DEV_SERVER_URL ?? APP_ORIGIN
}

async function registerAppProtocol() {
  await protocol.handle('app', async (request) => {
    const requestUrl = new URL(request.url)
    const pathname = decodeURIComponent(requestUrl.pathname)
    const candidate = path.resolve(RENDERER_DIST, `.${pathname === '/' ? '/index.html' : pathname}`)
    const relative = path.relative(RENDERER_DIST, candidate)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Not found', { status: 404 })
    }
    try {
      return await net.fetch(pathToFileURL(candidate).toString())
    } catch {
      if (path.extname(candidate)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(path.join(RENDERER_DIST, 'index.html')).toString())
    }
  })
}

function createWindow() {
  // This preload is for the trusted local UI only; remote WebContentsView instances must not receive it.
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    show: false,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'jobflow-icon.png')
      : path.join(process.env.VITE_PUBLIC, 'jobflow-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('close', () => {
    const controller = browserController
    browserController = undefined
    controller?.dispose()
  })

  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
    if (!isTrustedNavigation(url, trustedOrigin())) event.preventDefault()
  }
  win.webContents.on('will-navigate', preventUntrustedNavigation)
  win.webContents.on('will-redirect', preventUntrustedNavigation)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(`${APP_ORIGIN}/`)
  }
}

async function openPdfPreview(resumeId: string): Promise<void> {
  const preview = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: '简历预览',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const previewUrl = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}/#/resume-preview/${encodeURIComponent(resumeId)}`
    : `${APP_ORIGIN}/#/resume-preview/${encodeURIComponent(resumeId)}`
  const allowOnlyResume = (event: Electron.Event, url: string) => {
    if (url !== previewUrl) event.preventDefault()
  }
  preview.webContents.on('will-navigate', allowOnlyResume)
  preview.webContents.on('will-redirect', allowOnlyResume)
  try {
    await preview.loadURL(previewUrl)
  } catch (error) {
    if (!preview.isDestroyed()) preview.destroy()
    throw error
  }
}

function installContentSecurityPolicy() {
  const contentSecurityPolicy = buildContentSecurityPolicy(Boolean(VITE_DEV_SERVER_URL))
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    })
  })
}

function denyRendererPermissions() {
  installDenyAllPermissionPolicy(session.defaultSession)
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    browserController?.dispose()
    browserController = undefined
    database?.close()
    database = undefined
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  logger.info('application.starting', { version: app.getVersion(), packaged: app.isPackaged })
  Menu.setApplicationMenu(Menu.buildFromTemplate(createChineseMenuTemplate()))
  if (dataDirectoryInitializationError) {
    dialog.showErrorBox(
      'JobFlow 无法初始化数据目录',
      `JobFlow 无法准备数据目录 ${JOBFLOW_DATA_DIRECTORY}，因此没有继续使用旧目录。\n\n${dataDirectoryInitializationError.message}`,
    )
    app.quit()
    return
  }

  denyRendererPermissions()
  installContentSecurityPolicy()
  try {
    const migrationBackupStore = createSecureFileStore(electronSecretProtector)
    database = await openDatabase(
      JOBFLOW_DATA_DIRECTORY,
      path.join(app.getAppPath(), 'drizzle'),
      migrationBackupStore,
    )
  } catch (error) {
    logger.error('database.open.failed', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
    dialog.showErrorBox(
      'JobFlow 无法打开数据',
      `数据位于 ${JOBFLOW_DATA_DIRECTORY}。为避免数据丢失，旧目录尚未清理。\n\n${error instanceof Error ? error.message : String(error)}`,
    )
    app.quit()
    return
  }

  try {
    await migrateProfileProtection(database, electronSecretProtector)
  } catch (error) {
    logger.error('profile.protection.migration.failed', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
    dialog.showErrorBox(
      'JobFlow 无法安全解锁个人资料',
      `为避免资料以明文继续保存，JobFlow 已停止启动。现有数据未删除，旧数据目录也尚未清理。\n\n${error instanceof Error ? error.message : String(error)}`,
    )
    database.close()
    database = undefined
    app.quit()
    return
  }

  const chooseDirectory = async (title: string) => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title,
      defaultPath: JOBFLOW_DATA_DIRECTORY,
      properties: ['openDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
  const backupDialogs = {
    chooseExportPath: async () => {
      const parent = await chooseDirectory('选择完整备份保存位置')
      return parent
        ? path.join(parent, `JobFlow-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`)
        : null
    },
    chooseRestorePath: () => chooseDirectory('选择 JobFlow 备份文件夹'),
    chooseCsvPath: async () => {
      const parent = await chooseDirectory('选择 CSV 数据导出位置')
      return parent
        ? path.join(parent, `JobFlow-CSV-${new Date().toISOString().replace(/[:.]/g, '-')}`)
        : null
    },
  }
  let runtime: Awaited<ReturnType<typeof createApplicationRuntime>>
  try {
    runtime = await createApplicationRuntime({
      database,
      dataDirectory: JOBFLOW_DATA_DIRECTORY,
      version: app.getVersion(),
      secretProtector: electronSecretProtector,
      showResumeDialog: (options) =>
        win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options),
      resumeFileActions: {
        openPdf: openPdfPreview,
        openExternal: async (filePath) => {
          const error = await shell.openPath(filePath)
          if (error) throw new Error(error)
        },
        showInFolder: (filePath) => shell.showItemInFolder(filePath),
      },
      openExternal: (url) => shell.openExternal(url),
      openDirectory: async (directory) => {
        const error = await shell.openPath(directory)
        if (error) throw new Error(error)
      },
      backupDialogs,
      closeDatabase: () => database?.close(),
    })
  } catch (error) {
    logger.error('runtime.initialize.failed', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
    dialog.showErrorBox(
      'JobFlow 无法安全准备本地资料',
      `为避免未保护的个人资料或简历继续使用，JobFlow 已停止启动。现有文件和数据库记录均保留。\n\n${error instanceof Error ? error.message : String(error)}`,
    )
    database.close()
    database = undefined
    app.quit()
    return
  }
  const { repositories, notificationPreferences, settings, backup, services } = runtime
  try {
    if (dataDirectoryPreparation?.legacyDirectoryToRemove) markDataMigrationComplete(JOBFLOW_DATA_DIRECTORY)
    removeLegacyDataDirectory(dataDirectoryPreparation?.legacyDirectoryToRemove, JOBFLOW_DATA_DIRECTORY)
  } catch (error) {
    logger.warn('data.legacy.cleanup.failed', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
    dialog.showErrorBox(
      'JobFlow 数据已迁移，但旧目录未能清理',
      `当前数据已在 ${JOBFLOW_DATA_DIRECTORY} 正常打开。旧数据副本仍在 ${dataDirectoryPreparation?.legacyDirectoryToRemove ?? '原目录'}。请确认新数据完整后手动清理该旧目录。\n\n${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!VITE_DEV_SERVER_URL) await registerAppProtocol()
  notificationScheduler = createNotificationScheduler({
    isEnabled: () => notificationPreferences.getNotificationsEnabled(),
    findDue: (now) => {
      const applicationItems = repositories.applications.listDueNotifications(now) as Array<{
        kind: 'STAGE' | 'CUSTOM'
        id: string
        title: string
        body: string
        companyName: string
        jobTitle: string
        notificationAt: string
        jobId: string
      }>
      const interviewItems = (
        repositories.interviews.listDueNotifications(now) as Array<{
          id: string
          companyName: string
          jobTitle: string
          round: string
          notificationAt: string
          jobId: string
        }>
      ).map((interview) => ({
        ...interview,
        kind: 'INTERVIEW' as const,
        title: `${interview.companyName} 面试提醒`,
        body: `${interview.round} · ${interview.jobTitle}`,
      }))
      return [...applicationItems, ...interviewItems].sort((left, right) =>
        left.notificationAt.localeCompare(right.notificationAt),
      )
    },
    markSent: (kind, id, sentAt) => {
      if (kind === 'INTERVIEW') repositories.interviews.markNotificationSent(id, sentAt)
      else repositories.applications.markNotificationSent(kind, id, sentAt)
    },
    notify: (item) => {
      if (!Notification.isSupported()) throw new Error('当前系统不支持桌面通知')
      new Notification({ title: item.title, body: item.body }).show()
    },
  })
  notificationScheduler.start()
  createWindow()
  const browserSession = session.fromPartition('persist:jobflow-browser')
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.on('will-download', (event) => event.preventDefault())
  browserController = createElectronBrowserController(
    win!,
    browserSession,
    repositories.browser,
    path.join(JOBFLOW_DATA_DIRECTORY, 'browser-upload-temp'),
  )
  const savedSites = createSavedSiteService(database, browserController, repositories.companies)
  const browserResult = <T>(operation: () => T | Promise<T>) =>
    Promise.resolve()
      .then(operation)
      .then((data) => ({ ok: true as const, data }))
  registerHandlers(
    ipcMain,
    trustedOrigin(),
    {
      ...services,
      'jobflow:settings.getInfo': () => browserResult(() => settings.getInfo()),
      'jobflow:settings.openDataDirectory': () => browserResult(() => settings.openDataDirectory()),
      'jobflow:backup.exportFromDialog': () => browserResult(() => backup.exportFromDialog()),
      'jobflow:backup.restoreFromDialog': () => browserResult(() => backup.restoreFromDialog()),
      'jobflow:backup.exportCsvFromDialog': () => browserResult(() => backup.exportCsvFromDialog()),
      'jobflow:backup.applyStagedRestoreAndRestart': () =>
        browserResult(async () => {
          const result = await backup.applyStagedRestore()
          if (result.restartRequired) {
            notificationScheduler?.stop()
            browserController?.dispose()
            setTimeout(() => {
              app.relaunch()
              app.exit(0)
            }, 500)
          }
          return result
        }),
      'jobflow:browser.getState': () => browserResult(() => browserController!.getState()),
      'jobflow:browser.openTab': ([input]) =>
        browserResult(() => browserController!.openTab((input as { value: string }).value)),
      'jobflow:browser.activateTab': ([input]) =>
        browserResult(() => browserController!.activateTab(input as { id: string })),
      'jobflow:browser.closeTab': ([input]) =>
        browserResult(() => browserController!.closeTab(input as { id: string })),
      'jobflow:browser.navigate': ([input]) =>
        browserResult(() => browserController!.navigate(input as { id: string; value: string })),
      'jobflow:browser.back': () => browserResult(() => browserController!.back()),
      'jobflow:browser.forward': () => browserResult(() => browserController!.forward()),
      'jobflow:browser.reload': () => browserResult(() => browserController!.reload()),
      'jobflow:browser.setBounds': ([input]) =>
        browserResult(() =>
          browserController!.setBounds(input as { x: number; y: number; width: number; height: number }),
        ),
      'jobflow:browser.capturePage': () => browserResult(() => browserController!.capturePage()),
      'jobflow:browser.listSites': ([input]) =>
        browserResult(() => browserController!.listSites(input as { query?: string })),
      'jobflow:browser.saveSite': ([input]) =>
        browserResult(() =>
          savedSites.save(
            input as { companyId?: string | null; name: string; url: string; kind: 'COMPANY' | 'CAREERS' },
          ),
        ),
      'jobflow:browser.deleteSite': ([input]) =>
        browserResult(() => browserController!.deleteSite(input as { id: string })),
      'jobflow:browser.listHistory': ([input]) =>
        browserResult(() => browserController!.listHistory(input as { limit?: number })),
      'jobflow:browser.clearHistory': () => browserResult(() => browserController!.clearHistory()),
      'jobflow:browser.clearSession': () => browserResult(() => browserController!.clearSession()),
      'jobflow:browser.inspectForm': ([input]) =>
        browserResult(() => browserController!.inspectForm(input as BrowserInspectFormInput)),
      'jobflow:browser.listAutofillMappings': ([input]) =>
        browserResult(() => browserController!.listAutofillMappings(input as { hostname: string })),
      'jobflow:browser.saveAutofillMapping': ([input]) =>
        browserResult(() =>
          browserController!.saveAutofillMapping(
            input as { hostname: string; signature: string; sourceKey: string },
          ),
        ),
      'jobflow:browser.fillProfileFields': ([input]) =>
        browserResult(() => browserController!.fillProfileFields(input as BrowserFillFieldsInput)),
      'jobflow:browser.uploadResume': ([input]) =>
        browserResult(() => browserController!.uploadResume(input as BrowserUploadResumeInput)),
      'jobflow:browser.fillFocusedField': ([input]) =>
        browserResult(() => browserController!.fillFocusedField(input as { value: string })),
      'jobflow:browser.copyProfileValue': ([input]) =>
        browserResult(() => clipboard.writeText((input as { value: string }).value)),
    },
    (change) => win?.webContents.send('jobflow:data.changed', change),
    (channel, error) => {
      logger.error('ipc.operation.failed', {
        channel,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      })
    },
  )
  void browserController.ready.catch((error) =>
    logger.error('browser.session.restore.failed', {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  )
  logger.info('application.ready')
})

app.on('before-quit', () => {
  notificationScheduler?.stop()
  browserController?.dispose()
  logger.info('application.stopping')
})
