import { Button, Form, Input, Modal, Select, Space, Switch, message } from 'antd'
import type { CompanyDirectorySummary, JobCreateInput } from '../../../shared/contracts/api'

type CompanyOption = { id: string; name: string }
type Fields = Omit<JobCreateInput, 'tags' | 'allowDuplicate' | 'deadline'>

export function JobForm({
  open,
  companies,
  directoryCompanies,
  onSearchDirectory,
  onImportDirectoryCompany,
  onCancel,
  onSubmit,
  loading,
}: {
  open: boolean
  companies: CompanyOption[]
  directoryCompanies: CompanyDirectorySummary[]
  onSearchDirectory: (query: string) => void
  onImportDirectoryCompany: (directoryId: string) => Promise<CompanyOption>
  onCancel: () => void
  onSubmit: (values: JobCreateInput) => void | Promise<void>
  loading?: boolean
}) {
  const [form] = Form.useForm<Fields>()
  const [messageApi, contextHolder] = message.useMessage()
  const optionByValue = new Map(
    companies.map((company) => [
      company.id,
      { value: company.id, label: company.name, searchText: company.name },
    ]),
  )
  for (const company of directoryCompanies) {
    const searchText = [company.name, ...company.aliases, company.industryName].join(' ')
    if (company.localCompany && !company.localCompany.archivedAt) {
      const existing = optionByValue.get(company.localCompany.id)
      optionByValue.set(company.localCompany.id, {
        value: company.localCompany.id,
        label: company.localCompany.name,
        searchText: `${existing?.searchText ?? company.localCompany.name} ${searchText}`,
      })
    } else {
      const archivedLabel = company.localCompany?.archivedAt ? '（已归档，保存时恢复）' : ''
      optionByValue.set(`directory:${company.id}`, {
        value: `directory:${company.id}`,
        label: `${company.name} · ${company.industryName}${archivedLabel}`,
        searchText,
      })
    }
  }
  const options = [...optionByValue.values()]
  const submit = async (values: Fields) => {
    const fields = values
    let companyId = fields.companyId
    if (companyId.startsWith('directory:')) {
      try {
        const company = await onImportDirectoryCompany(companyId.slice('directory:'.length))
        companyId = company.id
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : '公司关联失败，岗位尚未保存')
        return
      }
    }
    await onSubmit({ ...fields, companyId })
  }
  return (
    <Modal title="添加岗位" open={open} onCancel={onCancel} footer={null} width={760} destroyOnHidden>
      {contextHolder}
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ priority: 2 }}>
        <div className="job-form-grid">
          <Form.Item name="companyId" label="公司" rules={[{ required: true, message: '请选择公司' }]}>
            <Select
              showSearch
              filterOption={(input, option) =>
                String(option?.searchText ?? '')
                  .toLocaleLowerCase('zh-CN')
                  .includes(input.trim().toLocaleLowerCase('zh-CN'))
              }
              onSearch={onSearchDirectory}
              placeholder="选择或搜索公司"
              options={options}
            />
          </Form.Item>
          <Form.Item name="title" label="岗位名称" rules={[{ required: true, message: '请填写岗位名称' }]}>
            <Input placeholder="例如：嵌入式软件工程师" />
          </Form.Item>
          <Form.Item name="city" label="城市">
            <Input placeholder="例如：上海" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input />
          </Form.Item>
          <Form.Item name="jobCode" label="岗位编号">
            <Input />
          </Form.Item>
          <Form.Item name="salary" label="薪资">
            <Input placeholder="例如：20–30K" />
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select
              options={[
                { value: 1, label: '高' },
                { value: 2, label: '普通' },
                { value: 3, label: '低' },
              ]}
            />
          </Form.Item>
          <Form.Item name="pinned" label="置顶跟进" valuePropName="checked">
            <Switch checkedChildren="置顶" unCheckedChildren="普通" />
          </Form.Item>
          <Form.Item name="nextAction" label="下一步行动">
            <Input placeholder="例如：准备简历" />
          </Form.Item>
          <Form.Item name="nextActionAt" label="行动时间">
            <Input placeholder="2026-09-25T09:00:00+08:00" />
          </Form.Item>
          <Form.Item name="url" label="招聘页面链接">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="source" label="信息来源">
            <Input placeholder="公司官网、招聘平台等" />
          </Form.Item>
          <Form.Item name="pageTitle" label="页面标题">
            <Input />
          </Form.Item>
        </div>
        <Form.Item name="requirements" label="岗位要求 / JD">
          <Input.TextArea rows={5} placeholder="粘贴岗位描述，保留原文" />
        </Form.Item>
        <Form.Item name="jdText" label="招聘页面 JD 快照">
          <Input.TextArea rows={5} placeholder="保留招聘页面原始描述快照" />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存岗位
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
