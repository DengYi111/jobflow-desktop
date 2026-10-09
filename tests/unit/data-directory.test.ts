import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  markDataMigrationComplete,
  markDataMigrationSourceSelected,
  prepareDataDirectory,
} from '../../electron/data-directory'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jobflow-data-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('prepareDataDirectory', () => {
  it('copies legacy files to the persistent directory and keeps the source until explicitly cleaned', async () => {
    const root = await createTemporaryDirectory()
    const legacy = path.join(root, 'legacy-user-data')
    const target = path.join(root, 'JobFlow', 'Data')
    await mkdir(path.join(legacy, 'files', 'resumes'), { recursive: true })
    await writeFile(path.join(legacy, 'jobflow.sqlite'), 'database bytes')
    await writeFile(path.join(legacy, 'files', 'resumes', 'resume.pdf'), 'resume bytes')

    const result = await prepareDataDirectory(target, legacy)

    expect(result.migrated).toBe(true)
    expect(result.legacyDirectoryToRemove).toBe(legacy)
    expect(await readFile(path.join(target, 'jobflow.sqlite'), 'utf8')).toBe('database bytes')
    expect(await readFile(path.join(target, 'files', 'resumes', 'resume.pdf'), 'utf8')).toBe('resume bytes')
    expect(await readFile(path.join(legacy, 'jobflow.sqlite'), 'utf8')).toBe('database bytes')
  })

  it('does not overwrite an existing persistent directory when legacy data also exists', async () => {
    const root = await createTemporaryDirectory()
    const legacy = path.join(root, 'legacy-user-data')
    const target = path.join(root, 'JobFlow', 'Data')
    await mkdir(legacy, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(path.join(legacy, 'jobflow.sqlite'), 'legacy')
    await writeFile(path.join(target, 'jobflow.sqlite'), 'existing')

    expect(() => prepareDataDirectory(target, legacy)).toThrow(/数据目录.*同时存在/)
    expect(await readFile(path.join(target, 'jobflow.sqlite'), 'utf8')).toBe('existing')
    expect(await readFile(path.join(legacy, 'jobflow.sqlite'), 'utf8')).toBe('legacy')
  })

  it('uses an existing persistent directory and never treats it as a new migration target', async () => {
    const root = await createTemporaryDirectory()
    const target = path.join(root, 'JobFlow', 'Data')
    await mkdir(target, { recursive: true })

    const result = await prepareDataDirectory(target, path.join(root, 'missing-legacy'))

    expect(result.migrated).toBe(false)
    expect(result.legacyDirectoryToRemove).toBeUndefined()
  })

  it('retries legacy cleanup after a completed migration without treating the old copy as a conflict', async () => {
    const root = await createTemporaryDirectory()
    const legacy = path.join(root, 'legacy-user-data')
    const target = path.join(root, 'JobFlow', 'Data')
    await mkdir(legacy, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(path.join(legacy, 'jobflow.sqlite'), 'source database')
    await writeFile(path.join(target, 'jobflow.sqlite'), 'verified destination database')
    markDataMigrationComplete(target)

    const result = prepareDataDirectory(target, legacy)

    expect(result.migrated).toBe(false)
    expect(result.legacyDirectoryToRemove).toBe(legacy)
    expect(await readFile(path.join(legacy, 'jobflow.sqlite'), 'utf8')).toBe('source database')
  })

  it('retries a previously verified source choice without overwriting either copy', async () => {
    const root = await createTemporaryDirectory()
    const legacy = path.join(root, 'legacy-user-data')
    const target = path.join(root, 'JobFlow', 'Data')
    await mkdir(legacy, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(path.join(legacy, 'jobflow.sqlite'), 'legacy database')
    await writeFile(path.join(target, 'jobflow.sqlite'), 'verified database')
    markDataMigrationSourceSelected(target)

    const result = prepareDataDirectory(target, legacy)

    expect(result.legacyDirectoryToRemove).toBe(legacy)
    expect(await readFile(path.join(legacy, 'jobflow.sqlite'), 'utf8')).toBe('legacy database')
    expect(await readFile(path.join(target, 'jobflow.sqlite'), 'utf8')).toBe('verified database')
  })
})
