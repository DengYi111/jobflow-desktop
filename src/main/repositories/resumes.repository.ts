import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export function createResumesRepository(db: Database.Database) {
  return {
    create(input: {
      id?: string
      name: string
      relativePath: string
      originalName: string
      notes?: string | null
    }) {
      const resume = {
        ...input,
        id: input.id ?? randomUUID(),
        notes: input.notes ?? null,
        createdAt: new Date().toISOString(),
      }
      db.prepare(
        'INSERT INTO resume_versions(id,name,relative_path,original_name,notes,created_at) VALUES (@id,@name,@relativePath,@originalName,@notes,@createdAt)',
      ).run(resume)
      return resume
    },
    get(id: string) {
      return db
        .prepare(
          'SELECT id,name,relative_path AS relativePath,original_name AS originalName,notes,created_at AS createdAt,archived_at AS archivedAt FROM resume_versions WHERE id=?',
        )
        .get(id)
    },
    findByRelativePath(relativePath: string) {
      return db
        .prepare(
          'SELECT id,name,relative_path AS relativePath,original_name AS originalName,notes,created_at AS createdAt,archived_at AS archivedAt FROM resume_versions WHERE relative_path=? COLLATE NOCASE',
        )
        .get(relativePath)
    },
    list() {
      return db
        .prepare(
          'SELECT id,name,relative_path AS relativePath,original_name AS originalName,notes,created_at AS createdAt FROM resume_versions ORDER BY created_at DESC',
        )
        .all()
    },
    updateRelativePath(id: string, relativePath: string) {
      db.prepare('UPDATE resume_versions SET relative_path=? WHERE id=?').run(relativePath, id)
    },
    listAll() {
      return db
        .prepare(
          'SELECT id,name,relative_path AS relativePath,original_name AS originalName,notes,created_at AS createdAt,archived_at AS archivedAt FROM resume_versions ORDER BY created_at',
        )
        .all()
    },
  }
}
