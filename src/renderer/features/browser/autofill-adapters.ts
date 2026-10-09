import type { BrowserFormField } from '../../../shared/contracts/api'

export interface AutofillPlatformAdapter {
  id: string
  matches(hostname: string): boolean
  aliases: Record<string, string[]>
  extraFieldText(field: BrowserFormField): string[]
}

const generalRecruitmentAliases: Record<string, string[]> = {
  name: ['申请人', '应聘者姓名', '真实姓名'],
  phone: ['联系手机', '本人手机', '移动电话'],
  expectedCity: ['工作城市意向', '意向工作地'],
  school: ['毕业学校名称', '院校名称'],
  degree: ['最高学历层次'],
  graduationDate: ['毕业年月', '预计毕业年月'],
  internship: ['工作实践', '实践经历'],
  project: ['项目实践', '项目经验描述'],
}

const adapters: AutofillPlatformAdapter[] = [
  {
    id: 'zhipin',
    matches: (host) => /(^|\.)zhipin\.com$/i.test(host),
    aliases: { ...generalRecruitmentAliases, phone: [...generalRecruitmentAliases.phone, '手机号码'] },
    extraFieldText: (field) => [field.group ?? '', field.context ?? ''],
  },
  {
    id: '51job',
    matches: (host) => /(^|\.)51job\.com$/i.test(host),
    aliases: {
      ...generalRecruitmentAliases,
      expectedCity: [...generalRecruitmentAliases.expectedCity, '期望工作地'],
    },
    extraFieldText: (field) => [field.group ?? '', field.context ?? ''],
  },
  {
    id: 'zhaopin',
    matches: (host) => /(^|\.)zhaopin\.com$/i.test(host),
    aliases: generalRecruitmentAliases,
    extraFieldText: (field) => [field.group ?? '', field.context ?? ''],
  },
  {
    id: 'liepin',
    matches: (host) => /(^|\.)liepin\.com$/i.test(host),
    aliases: generalRecruitmentAliases,
    extraFieldText: (field) => [field.group ?? '', field.context ?? ''],
  },
  {
    id: 'hellobike-campus',
    matches: (host) => /(^|\.)hellobike\./i.test(host),
    aliases: {
      ...generalRecruitmentAliases,
      currentCity: ['所在城市', '目前居住城市'],
      documentNumber: ['证件号', '身份证号'],
      expectedCity: ['意向城市', '期望工作城市'],
    },
    extraFieldText: (field) => [field.group ?? '', field.context ?? '', field.name ?? '', field.id ?? ''],
  },
]

const genericAdapter: AutofillPlatformAdapter = {
  id: 'generic',
  matches: () => true,
  aliases: generalRecruitmentAliases,
  extraFieldText: (field) => [field.group ?? '', field.context ?? ''],
}

export function adapterForHostname(hostname: string): AutofillPlatformAdapter {
  return adapters.find((adapter) => adapter.matches(hostname)) ?? genericAdapter
}
