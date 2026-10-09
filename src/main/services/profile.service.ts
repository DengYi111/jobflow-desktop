import type { JobRepositories } from './jobs.service'
import { protectValue, unprotectValue, type SecretProtector } from '../security/protected-value'

const profileFields = [
  'name',
  'phone',
  'email',
  'gender',
  'birthday',
  'hometown',
  'currentCity',
  'expectedCity',
  'expectedSalary',
  'documentType',
  'documentNumber',
  'ethnicity',
  'emergencyContactName',
  'emergencyContactPhone',
  'mailingAddress',
] as const
const educationFields = ['school', 'degree', 'major', 'startDate', 'endDate', 'notes'] as const
const internshipFields = ['employer', 'role', 'startDate', 'endDate', 'description'] as const
const projectFields = ['name', 'role', 'startDate', 'endDate', 'description'] as const
const customFieldFields = ['label', 'value'] as const

async function protectFields<T extends object>(
  input: T,
  fields: readonly string[],
  protector: SecretProtector,
): Promise<T> {
  const output = { ...input } as unknown as Record<string, unknown>
  for (const field of fields) {
    const value = output[field]
    if (typeof value === 'string') output[field] = await protectValue(value, protector)
  }
  return output as T
}

async function unprotectFields<T extends object>(
  input: T | null | undefined,
  fields: readonly string[],
  protector: SecretProtector,
): Promise<T | null> {
  if (!input) return null
  const output = { ...input } as unknown as Record<string, unknown>
  for (const field of fields) {
    const value = output[field]
    if (typeof value === 'string') output[field] = (await unprotectValue(value, protector)).value
  }
  return output as T
}

export function createProfileService(repositories: JobRepositories, protector: SecretProtector) {
  async function ensureEncryptionAvailable() {
    if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用')
  }

  return {
    async get() {
      await ensureEncryptionAvailable()
      const profile = await unprotectFields(repositories.profile.get(), profileFields, protector)
      const [education, internships, projects, customFields] = await Promise.all([
        Promise.all(
          repositories.profile
            .listEducation()
            .map((item) => unprotectFields(item as Record<string, unknown>, educationFields, protector)),
        ),
        Promise.all(
          repositories.profile
            .listInternships()
            .map((item) => unprotectFields(item as Record<string, unknown>, internshipFields, protector)),
        ),
        Promise.all(
          repositories.profile
            .listProjects()
            .map((item) => unprotectFields(item as Record<string, unknown>, projectFields, protector)),
        ),
        Promise.all(
          repositories.profile
            .listCustomFields()
            .map((item) => unprotectFields(item as Record<string, unknown>, customFieldFields, protector)),
        ),
      ])
      return { profile, education, internships, projects, customFields }
    },
    async save(input: Parameters<JobRepositories['profile']['save']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, profileFields, protector)
      return unprotectFields(repositories.profile.save(stored), profileFields, protector)
    },
    async addEducation(input: Parameters<JobRepositories['profile']['addEducation']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, educationFields, protector)
      return unprotectFields(repositories.profile.addEducation(stored), educationFields, protector)
    },
    async updateEducation(input: { id: string } & Parameters<JobRepositories['profile']['addEducation']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, educationFields, protector)
      return unprotectFields(
        repositories.profile.updateEducation(stored) as Record<string, unknown>,
        educationFields,
        protector,
      )
    },
    deleteEducation(id: string) {
      repositories.profile.deleteEducation(id)
    },
    async addInternship(input: Parameters<JobRepositories['profile']['addInternship']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, internshipFields, protector)
      return unprotectFields(repositories.profile.addInternship(stored), internshipFields, protector)
    },
    async updateInternship(input: Parameters<JobRepositories['profile']['updateInternship']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, internshipFields, protector)
      return unprotectFields(
        repositories.profile.updateInternship(stored) as Record<string, unknown>,
        internshipFields,
        protector,
      )
    },
    deleteInternship(id: string) {
      repositories.profile.deleteInternship(id)
    },
    async addProject(input: Parameters<JobRepositories['profile']['addProject']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, projectFields, protector)
      return unprotectFields(repositories.profile.addProject(stored), projectFields, protector)
    },
    async updateProject(input: { id: string } & Parameters<JobRepositories['profile']['addProject']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, projectFields, protector)
      return unprotectFields(
        repositories.profile.updateProject(stored) as Record<string, unknown>,
        projectFields,
        protector,
      )
    },
    deleteProject(id: string) {
      repositories.profile.deleteProject(id)
    },
    async saveCustomField(input: Parameters<JobRepositories['profile']['saveCustomField']>[0]) {
      await ensureEncryptionAvailable()
      const stored = await protectFields(input, customFieldFields, protector)
      return unprotectFields(
        repositories.profile.saveCustomField(stored) as Record<string, unknown>,
        customFieldFields,
        protector,
      )
    },
    deleteCustomField(fieldKey: string) {
      repositories.profile.deleteCustomField(fieldKey)
    },
  }
}
