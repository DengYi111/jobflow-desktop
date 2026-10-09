import type Database from 'better-sqlite3'
import { createRepositories } from '../../src/main/repositories'
import { createJobIpcServices } from '../../src/main/services/job-ipc-services'
import { createDashboardService } from '../../src/main/services/dashboard.service'
import { createSettingsService } from '../../src/main/services/settings.service'
import { createBackupService, type BackupDialogs } from '../../src/main/services/backup.service'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { createLegacyRestorePreparer } from '../../src/main/services/prepare-legacy-restore'
import type { SecretProtector } from '../../src/main/security/protected-value'
import type { ResumeDialog, ResumeFileActions } from '../../src/main/services/resumes.service'

type IpcServices = Omit<ReturnType<typeof createJobIpcServices>, 'initializeSecureData'>

export interface RuntimePorts {
  database: Database.Database
  dataDirectory: string
  version: string
  secretProtector: SecretProtector
  showResumeDialog: ResumeDialog
  resumeFileActions: ResumeFileActions
  openExternal(url: string): Promise<void>
  openDirectory(directory: string): Promise<void>
  backupDialogs: BackupDialogs
  closeDatabase(): void
}

export async function createApplicationRuntime(ports: RuntimePorts) {
  const repositories = createRepositories(ports.database)
  const notificationPreferences = createDashboardService(ports.database, repositories)
  const settings = createSettingsService({
    dataDirectory: ports.dataDirectory,
    version: ports.version,
    openDirectory: ports.openDirectory,
  })
  const secureFileStore = createSecureFileStore(ports.secretProtector)
  const backup = createBackupService(ports.database, ports.dataDirectory, ports.backupDialogs, {
    closeDatabase: ports.closeDatabase,
    secureFileStore,
    prepareLegacyRestore: createLegacyRestorePreparer({
      protector: ports.secretProtector,
      fileStore: secureFileStore,
    }),
  })
  const registeredServices = createJobIpcServices(ports.database, repositories, ports.openExternal, {
    userDataDirectory: ports.dataDirectory,
    secretProtector: ports.secretProtector,
    showOpenDialog: ports.showResumeDialog,
    fileActions: ports.resumeFileActions,
  })
  const { initializeSecureData, ...services } = registeredServices
  await initializeSecureData()
  return { repositories, notificationPreferences, settings, backup, services: services as IpcServices }
}
