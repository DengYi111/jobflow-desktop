import Database from 'better-sqlite3'
import path from 'node:path'
import { createRepositories } from '../repositories'
import type { SecretProtector } from '../security/protected-value'
import type { SecureFileStore } from './secure-file-store'
import { migrateProfileProtection } from './profile-protection-migration'
import { createResumesService } from './resumes.service'

export function createLegacyRestorePreparer(security: {
  protector: SecretProtector
  fileStore: SecureFileStore
}) {
  return async (stagingDirectory: string) => {
    const database = new Database(path.join(stagingDirectory, 'jobflow.sqlite'))
    try {
      await migrateProfileProtection(database, security.protector)
      const resumes = createResumesService(
        createRepositories(database),
        stagingDirectory,
        async () => ({ canceled: true, filePaths: [] }),
        undefined,
        security,
      )
      await resumes.migrateStorage()
    } finally {
      database.close()
    }
  }
}
