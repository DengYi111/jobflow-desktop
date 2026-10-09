import { describe, expect, it } from 'vitest'
import {
  companyDirectoryImportInputSchema,
  companyDirectoryListInputSchema,
  jobflowDomains,
  jobsListInputSchema,
} from '../../src/shared/contracts/api'
import {
  emptyInputSchema,
  interviewCreateInputSchema,
  interviewUpdateInputSchema,
  profileAutofillFieldSchema,
} from '../../src/shared/schemas/common'

describe('JobFlow API contract', () => {
  it('exposes only approved business domains', () => {
    expect(jobflowDomains).toEqual([
      'dashboard',
      'companies',
      'jobs',
      'applications',
      'reminders',
      'interviews',
      'profile',
      'resumes',
      'settings',
      'backup',
      'links',
      'browser',
    ])
  })

  it('rejects malformed jobs.list filters', () => {
    expect(() => jobsListInputSchema.parse({ filters: { priority: 'urgent' } })).toThrow()
    expect(jobsListInputSchema.safeParse({ filters: { stage: 'GARBAGE' } }).success).toBe(false)
    expect(jobsListInputSchema.safeParse({ filters: { query: '实习', city: '杭州' } }).success).toBe(true)
    expect(jobsListInputSchema.safeParse({ direction: 'sideways' }).success).toBe(false)
    expect(jobsListInputSchema.parse({}).direction).toBe('desc')
  })

  it('validates catalog searches by industry and accepts only stable catalog IDs', () => {
    expect(
      companyDirectoryListInputSchema.safeParse({ query: '腾讯', industryId: 'internet-software' }).success,
    ).toBe(true)
    expect(companyDirectoryListInputSchema.safeParse({ industryId: 'made-up-industry' }).success).toBe(false)
    expect(companyDirectoryListInputSchema.safeParse({ query: 'x'.repeat(201) }).success).toBe(false)
    expect(companyDirectoryImportInputSchema.safeParse({ directoryId: 'internet-software-01' }).success).toBe(
      true,
    )
    expect(companyDirectoryImportInputSchema.safeParse({ directoryId: 'C:\\private\\file' }).success).toBe(
      false,
    )
  })

  it('requires empty, explicit requests before clearing browser history or session data', () => {
    expect(emptyInputSchema.safeParse({}).success).toBe(true)
    expect(emptyInputSchema.safeParse({ clearJobs: true }).success).toBe(false)
  })

  it('allows the added local identity and emergency-contact fields as explicit autofill mappings', () => {
    for (const field of [
      'documentType',
      'documentNumber',
      'ethnicity',
      'emergencyContactName',
      'emergencyContactPhone',
      'mailingAddress',
    ]) {
      expect(profileAutofillFieldSchema.safeParse(field).success).toBe(true)
    }
  })

  it('requires numbered interview rounds and rejects legacy free-text round names', () => {
    const createBase = {
      applicationId: '4787a46f-8a65-48eb-a66b-15c5b1e713e6',
      interviewAt: '2026-10-01T09:30:00.000Z',
    }
    const updateBase = { id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', interviewAt: '2026-10-01T09:30:00.000Z' }
    expect(interviewCreateInputSchema.safeParse({ ...createBase, roundNumber: 1 }).success).toBe(true)
    expect(interviewCreateInputSchema.safeParse({ ...createBase, round: '技术一面' }).success).toBe(false)
    expect(interviewUpdateInputSchema.safeParse({ ...updateBase, roundNumber: 2 }).success).toBe(true)
    expect(interviewUpdateInputSchema.safeParse({ ...updateBase, round: 'HR 终面' }).success).toBe(false)
  })
})
