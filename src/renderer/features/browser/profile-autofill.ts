import type { BrowserAutofillMappingInput } from '../../../shared/contracts/api'

type ExperienceKind = 'education' | 'internship' | 'project'
type ExperienceValue = Record<string, string | null | undefined> & { id?: string }

export interface AutofillProfile {
  profile?: Record<string, string | null> | null
  education?: ExperienceValue[]
  internships?: ExperienceValue[]
  projects?: ExperienceValue[]
}

export interface AutofillSource {
  key: string
  label: string
  value: string
  profileField?: BrowserAutofillMappingInput['sourceKey']
  kind?: 'profile' | 'file'
  resumeId?: string
}

const profileFields: Array<[string, string]> = [
  ['name', '姓名'],
  ['phone', '手机号'],
  ['email', '邮箱'],
  ['gender', '性别'],
  ['birthday', '出生日期'],
  ['hometown', '籍贯'],
  ['currentCity', '当前城市'],
  ['expectedCity', '期望城市'],
  ['expectedSalary', '期望薪资'],
  ['documentType', '证件类型'],
  ['documentNumber', '证件号码'],
  ['ethnicity', '民族'],
  ['emergencyContactName', '紧急联系人'],
  ['emergencyContactPhone', '紧急联系人电话'],
  ['mailingAddress', '通讯地址'],
  ['school', '学校'],
  ['degree', '学历'],
  ['major', '专业'],
  ['graduationDate', '毕业时间'],
]

const experienceFields: Record<ExperienceKind, Array<{ key: string; label: string }>> = {
  education: [
    { key: 'school', label: '学校' },
    { key: 'degree', label: '学历' },
    { key: 'major', label: '专业' },
    { key: 'startDate', label: '开始时间' },
    { key: 'endDate', label: '结束时间' },
    { key: 'notes', label: '经历说明' },
  ],
  internship: [
    { key: 'employer', label: '实习单位' },
    { key: 'role', label: '职位' },
    { key: 'startDate', label: '开始时间' },
    { key: 'endDate', label: '结束时间' },
    { key: 'description', label: '工作内容' },
  ],
  project: [
    { key: 'name', label: '项目名称' },
    { key: 'role', label: '担任角色' },
    { key: 'startDate', label: '开始时间' },
    { key: 'endDate', label: '结束时间' },
    { key: 'description', label: '项目描述' },
  ],
}

const kindLabel: Record<ExperienceKind, string> = {
  education: '教育经历',
  internship: '实习经历',
  project: '项目经历',
}

export function buildAutofillSources(profile: AutofillProfile): AutofillSource[] {
  const sources: AutofillSource[] = []
  for (const [key, label] of profileFields) {
    const value = profile.profile?.[key]
    if (typeof value === 'string' && value.trim())
      sources.push({ key, label, value: value.trim(), profileField: key })
  }
  for (const kind of ['education', 'internship', 'project'] as const) {
    const entries =
      kind === 'education'
        ? profile.education
        : kind === 'internship'
          ? profile.internships
          : profile.projects
    entries?.forEach((entry, index) => {
      const entryKey = entry.id || String(index)
      for (const field of experienceFields[kind]) {
        const value = entry[field.key]
        if (typeof value === 'string' && value.trim())
          sources.push({
            key: `${kind}.${entryKey}.${field.key}`,
            label: `${field.label} · ${kindLabel[kind]} ${index + 1}`,
            value: value.trim(),
          })
      }
    })
  }
  return sources
}

export function formatAutofillValue(value: string, inputType: string): string {
  if (inputType === 'month') {
    const match = value.match(/^(\d{4})[-/.年](\d{1,2})/)
    return match ? `${match[1]}-${match[2].padStart(2, '0')}` : ''
  }
  if (inputType === 'date') {
    const match = value.match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/)
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${(match[3] ?? '01').padStart(2, '0')}` : ''
  }
  if (inputType === 'number' && !/^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) return ''
  return value
}
