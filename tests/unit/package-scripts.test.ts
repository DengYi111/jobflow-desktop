import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('package quality gates and dependency policy', () => {
  it('defines reproducible quality and performance commands', () => {
    for (const script of [
      'format',
      'format:check',
      'typecheck',
      'lint',
      'test:unit',
      'test:integration',
      'test:bench',
      'test',
      'build',
      'verify',
    ]) {
      expect(manifest.scripts[script], `${script} script`).toBeTruthy()
    }
  })

  it('pins every direct production and development dependency to one exact version', () => {
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
      expect(version, `${name} must use an exact semver version`).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)
    }
  })
})
