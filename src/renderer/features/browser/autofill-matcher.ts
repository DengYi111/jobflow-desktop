import type { BrowserFormField } from '../../../shared/contracts/api'
import type { AutofillPlatformAdapter } from './autofill-adapters'
import type { AutofillSource } from './profile-autofill'

export interface AutofillMatch {
  source?: AutofillSource
  confidence: number
  evidence: string
}

const fieldAliases: Record<string, string[]> = {
  name: ['姓名', '真实姓名', '申请人姓名', '申请人', '应聘者姓名', 'fullname', 'legalname'],
  phone: ['手机号', '手机号码', '联系电话', '电话号码', '联系电话', 'mobile', 'phone', 'tel'],
  email: ['电子邮箱', '邮箱', '电子邮件', 'email'],
  gender: ['性别', 'gender', 'sex'],
  birthday: ['出生日期', '生日', '出生年月', 'birthday', 'dateofbirth', 'dob'],
  hometown: ['籍贯', '户籍所在地', '家乡', 'hometown', 'nativeplace'],
  currentCity: ['当前城市', '现居城市', '居住城市', '居住地', 'currentcity', 'currentaddress'],
  expectedCity: ['期望城市', '意向城市', '工作地点意向', '期望工作地', 'expectedcity', 'preferredcity'],
  expectedSalary: ['期望薪资', '期望月薪', '薪资期望', 'expectedsalary'],
  documentType: ['证件类型', '证件类别', '证件种类', 'documenttype', 'idtype'],
  documentNumber: ['证件号码', '证件号', '身份证号码', '身份证号', 'documentnumber', 'idnumber'],
  ethnicity: ['民族', 'ethnicity', 'ethnicgroup'],
  emergencyContactName: ['紧急联系人姓名', '紧急联系人', 'emergencycontactname'],
  emergencyContactPhone: ['紧急联系人电话', '紧急联系电话', '紧急联系人手机号', 'emergencycontactphone'],
  mailingAddress: ['通讯地址', '通信地址', '联系地址', 'mailingaddress', 'postaladdress'],
  school: ['学校', '院校', '毕业院校', 'school', 'university', 'college'],
  degree: ['学历', '学位', '最高学历', 'degree', 'educationlevel'],
  major: ['专业', '所学专业', 'major', 'fieldofstudy'],
  graduationDate: ['毕业时间', '毕业日期', '预计毕业', 'graduationdate', 'graduationyear'],
}

const experienceAliases: Record<string, string[]> = {
  school: ['学校', '院校', '毕业院校', 'school', 'university', 'college'],
  degree: ['学历', '学位', 'degree', 'educationlevel'],
  major: ['专业', 'major', 'fieldofstudy'],
  employer: ['实习单位', '实习公司', '工作单位', '雇主', 'employer', 'company'],
  role: ['担任角色', '职位', '岗位名称', 'role', 'position', 'jobtitle'],
  name: ['项目名称', '项目标题', 'projectname', 'projecttitle'],
  startDate: ['入学时间', '开始时间', '开始日期', '起始时间', 'startdate', 'fromdate'],
  endDate: ['毕业时间', '结束时间', '结束日期', '离校时间', 'enddate', 'todate'],
  description: ['工作内容', '工作描述', '职责', '项目描述', '项目内容', 'description', 'responsibilities'],
  notes: ['教育描述', '教育说明', '经历说明', 'educationdescription'],
}

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '')
const includesAlias = (text: string, aliases: string[]) =>
  aliases.some((alias) => text.includes(normalize(alias)))

function bestField(sourceKey: string, fieldText: string): { key: string; score: number } | undefined {
  const parts = sourceKey.split('.')
  const kind = parts[0]
  const property = parts[parts.length - 1] ?? ''
  const aliases = fieldAliases[property]
  if (aliases && includesAlias(fieldText, aliases)) return { key: property, score: 0.78 }
  if (!['education', 'internship', 'project'].includes(kind)) return undefined

  const contextKind =
    kind === 'education'
      ? /教育|学历|education|school|university/.test(fieldText)
      : kind === 'internship'
        ? /实习|工作经历|internship|workexperience/.test(fieldText)
        : /项目|project/.test(fieldText)
  if (!contextKind) return undefined
  const properties = experienceAliases[property]
  return properties && includesAlias(fieldText, properties) ? { key: property, score: 0.72 } : undefined
}

function autocompleteTarget(value: string): string | undefined {
  const tokens = value.toLowerCase().split(/\s+/)
  const tokenMap: Record<string, string> = {
    name: 'name',
    'given-name': 'name',
    'family-name': 'name',
    email: 'email',
    tel: 'phone',
    bday: 'birthday',
    'address-level2': 'currentCity',
    'street-address': 'mailingAddress',
  }
  return tokens.map((token) => tokenMap[token]).find(Boolean)
}

export function matchAutofillField(
  field: BrowserFormField,
  sources: AutofillSource[],
  adapter: AutofillPlatformAdapter,
  previousSourceKey?: string,
  occurrenceCounts: Map<string, number> = new Map(),
): AutofillMatch {
  if (previousSourceKey) {
    const remembered = sources.find((source) => source.key === previousSourceKey)
    if (remembered && (field.kind !== 'file' || remembered.kind === 'file'))
      return { source: remembered, confidence: 1, evidence: '你保存的字段映射' }
  }
  if (field.kind === 'file') return { confidence: 0, evidence: '请选择本机已保存的 PDF 简历' }

  const label = normalize(field.label)
  const aria = normalize(field.ariaLabel ?? '')
  const attributes = normalize(`${field.name ?? ''} ${field.id ?? ''} ${field.signature}`)
  const structural = normalize(
    `${field.group ?? ''} ${field.context ?? ''} ${adapter.extraFieldText(field).join(' ')}`,
  )
  const allEvidence = `${label} ${aria} ${attributes} ${structural}`
  const sectionKind = /实习|工作经历|internship|workexperience/.test(structural)
    ? 'internship'
    : /项目经历|项目经验|project/.test(structural)
      ? 'project'
      : /教育经历|教育背景|education|school|university/.test(structural)
        ? 'education'
        : undefined
  const autoKey = autocompleteTarget(field.autocomplete ?? '')
  let chosen: AutofillSource | undefined
  let confidence = 0
  let evidence = ''

  for (const source of sources) {
    let score = 0
    let reason = ''
    const profileKey = source.profileField
    if (autoKey && profileKey === autoKey) {
      score = 0.99
      reason = `autocomplete=${field.autocomplete}`
    }
    const candidateAliases = profileKey ? (fieldAliases[profileKey] ?? []) : []
    const platformAliases = profileKey ? (adapter.aliases[profileKey] ?? []) : []
    if (candidateAliases.length && includesAlias(aria, candidateAliases)) {
      score = Math.max(score, 0.97)
      reason ||= 'ARIA 标签'
    }
    if (candidateAliases.length && includesAlias(label, candidateAliases)) {
      const exact = candidateAliases.some((alias) => label === normalize(alias))
      score = Math.max(score, exact ? 0.94 : 0.86)
      reason ||= exact ? '字段标题精确匹配' : '字段标题匹配'
    }
    if (
      platformAliases.length &&
      (includesAlias(label, platformAliases) || includesAlias(aria, platformAliases))
    ) {
      score = Math.max(score, 0.96)
      reason ||= `${adapter.id} 平台字段规则`
    }
    if (candidateAliases.length && includesAlias(attributes, candidateAliases)) {
      score = Math.max(score, 0.82)
      reason ||= '字段属性匹配'
    }
    if (candidateAliases.length && includesAlias(structural, candidateAliases)) {
      score = Math.max(score, 0.68)
      reason ||= '表单分组提示'
    }

    const experience = bestField(source.key, allEvidence)
    if (experience) {
      const sourceKind = source.key.split('.')[0]
      score = Math.max(score, sectionKind === sourceKind ? 0.96 : experience.score + (label ? 0.12 : 0))
      reason ||= '经历类型与字段标题匹配'
    }
    if (
      sectionKind &&
      profileKey &&
      ['school', 'degree', 'major', 'graduationDate'].includes(profileKey) &&
      !/最高学历|最高学位|highestdegree/.test(label)
    )
      score = Math.min(score, 0.58)
    if (score > confidence) {
      confidence = score
      chosen = source
      evidence = reason
    }
  }

  if (
    chosen?.key.startsWith('education.') ||
    chosen?.key.startsWith('internship.') ||
    chosen?.key.startsWith('project.')
  ) {
    const parts = chosen.key.split('.')
    const property = parts[parts.length - 1]
    const counter = `${parts[0]}.${property}`
    const occurrence = occurrenceCounts.get(counter) ?? 0
    const alternatives = sources.filter(
      (source) => source.key.startsWith(`${parts[0]}.`) && source.key.endsWith(`.${property}`),
    )
    chosen = alternatives[occurrence] ?? chosen
    occurrenceCounts.set(counter, occurrence + 1)
  }

  return chosen
    ? { source: chosen, confidence, evidence }
    : { confidence: 0, evidence: '未找到可靠的字段特征' }
}
