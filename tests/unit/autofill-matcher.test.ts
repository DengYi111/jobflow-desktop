import { describe, expect, it } from 'vitest'
import type { BrowserFormField } from '../../src/shared/contracts/api'
import { adapterForHostname } from '../../src/renderer/features/browser/autofill-adapters'
import { matchAutofillField } from '../../src/renderer/features/browser/autofill-matcher'
import { buildAutofillSources } from '../../src/renderer/features/browser/profile-autofill'

describe('experience autofill matching', () => {
  it('matches education, internship and project fields from their own sections', () => {
    const sources = buildAutofillSources({
      education: [{ id: 'edu-1', school: '武汉大学', degree: '本科' }],
      internships: [{ id: 'intern-1', employer: '星河科技', role: '软件实习生' }],
      projects: [{ id: 'project-1', name: '设备驱动项目', description: '负责驱动开发' }],
    })
    const match = (label: string, section: string, signature: string) =>
      matchAutofillField(
        {
          index: 0,
          tag: 'input',
          type: 'text',
          label,
          group: section,
          context: section,
          signature,
        } satisfies BrowserFormField,
        sources,
        adapterForHostname('careers.example.com'),
      )

    expect(match('学校', '教育经历', 'school').source).toMatchObject({
      key: 'education.edu-1.school',
      value: '武汉大学',
    })
    expect(match('实习单位', '实习经历', 'employer').source).toMatchObject({
      key: 'internship.intern-1.employer',
      value: '星河科技',
    })
    expect(match('项目名称', '项目经历', 'project-name').source).toMatchObject({
      key: 'project.project-1.name',
      value: '设备驱动项目',
    })
  })

  it('maps repeated experience rows to matching values in profile order', () => {
    const sources = buildAutofillSources({
      education: [
        { id: 'edu-1', school: '武汉大学' },
        { id: 'edu-2', school: '华中科技大学' },
      ],
    })
    const occurrences = new Map<string, number>()
    const field: BrowserFormField = {
      index: 0,
      tag: 'input',
      type: 'text',
      label: '学校',
      group: '教育经历',
      context: '教育经历',
      signature: 'school-row',
    }
    const adapter = adapterForHostname('careers.example.com')

    const first = matchAutofillField(field, sources, adapter, undefined, occurrences)
    const second = matchAutofillField(
      { ...field, index: 1, signature: 'school-row-2' },
      sources,
      adapter,
      undefined,
      occurrences,
    )

    expect([first.source?.value, second.source?.value]).toEqual(['武汉大学', '华中科技大学'])
  })
})
