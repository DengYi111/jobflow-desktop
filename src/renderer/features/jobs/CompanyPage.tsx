import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd'
import type { FormInstance } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import type {
  CompanyCreateInput,
  CompanyDirectorySummary,
  CompanySummary,
} from '../../../shared/contracts/api'
import { companyIndustryDefinitions } from '../../../shared/constants/company-industries'
import { stageLabels, type ApplicationStage } from '../../../shared/constants/stages'

const { Title, Text } = Typography
type Industry = { id: string; nameZh: string }
type IndustryId = NonNullable<CompanyCreateInput['industryId']>
type Company = Omit<CompanySummary, 'industryId'> & {
  industryId?: IndustryId | null
  notes?: string | null
  jobs?: Job[]
  archivedAt?: string | null
}
type CompanyFields = Pick<Company, 'name' | 'careersUrl' | 'website' | 'notes' | 'industryId'>
type DirectoryCompany = CompanyDirectorySummary
type Job = { id: string; title: string; city?: string | null; stage: ApplicationStage; updatedAt: string }
type Result<T> = { ok: true; data: T } | { ok: false; messageZh: string }
function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function CompanyPage() {
  const { companyId } = useParams()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<Company[]>([])
  const [detail, setDetail] = useState<Company | null>(null)
  const [directoryCompanies, setDirectoryCompanies] = useState<DirectoryCompany[]>([])
  const [industries, setIndustries] = useState<Industry[]>([...companyIndustryDefinitions])
  const [industryFilter, setIndustryFilter] = useState<IndustryId>()
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [activeTab, setActiveTab] = useState('mine')
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<CompanyFields>()
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    if (companyId) setDetail(data(await window.jobflow.companies.get({ id: companyId })) as Company | null)
    else setCompanies(data(await window.jobflow.companies.list()) as Company[])
  }, [companyId])
  useEffect(() => {
    void load().catch((error) =>
      messageApi.error(error instanceof Error ? error.message : '公司信息加载失败'),
    )
  }, [load, messageApi])

  const loadDirectory = async (
    query = directoryQuery,
    selectedIndustry: IndustryId | undefined = industryFilter,
  ) => {
    setDirectoryLoading(true)
    try {
      const result = data(
        await window.jobflow.companies.listDirectory({
          query: query || undefined,
          industryId: selectedIndustry,
        }),
      ) as { industries: Industry[]; companies: DirectoryCompany[] }
      setIndustries(result.industries)
      setDirectoryCompanies(result.companies)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '公司目录加载失败')
    } finally {
      setDirectoryLoading(false)
    }
  }

  const beginEdit = async (company?: Company) => {
    setEditing(company ?? null)
    form.setFieldsValue(company ?? {})
    setOpen(true)
  }
  const save = async (values: CompanyFields) => {
    try {
      if (editing) data(await window.jobflow.companies.update({ id: editing.id, ...values }))
      else data(await window.jobflow.companies.create(values))
      setOpen(false)
      messageApi.success(editing ? '公司信息已更新' : '公司已添加')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    }
  }
  const addDirectoryCompany = async (entry: DirectoryCompany) => {
    try {
      const company = data(
        await window.jobflow.companies.addFromDirectory({ directoryId: entry.id }),
      ) as Company
      setDirectoryCompanies((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, localCompany: company } : item)),
      )
      messageApi.success(entry.localCompany?.archivedAt ? '公司已恢复到我的公司' : '已添加到我的公司')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '添加公司失败')
    }
  }
  const archive = (company: Company) =>
    Modal.confirm({
      title: '归档公司',
      content: `确认归档「${company.name}」？已有岗位记录会保留。`,
      okText: '归档',
      cancelText: '取消',
      onOk: async () => {
        data(await window.jobflow.companies.archive({ id: company.id }))
        await load()
      },
    })
  const openExternal = (url: string) => navigate(`/browser?url=${encodeURIComponent(url)}`)
  const jobColumns = [
    {
      title: '岗位',
      dataIndex: 'title',
      render: (title: string, job: Job) => (
        <button className="job-title-button" onClick={() => navigate(`/jobs/${job.id}`)}>
          {title}
        </button>
      ),
    },
    { title: '城市', dataIndex: 'city', render: (city?: string) => city || '—' },
    { title: '阶段', dataIndex: 'stage', render: (stage: ApplicationStage) => stageLabels['zh-CN'][stage] },
    { title: '更新时间', dataIndex: 'updatedAt', render: (date: string) => date.slice(0, 10) },
  ]

  if (companyId)
    return (
      <div className="page">
        {contextHolder}
        <header className="page-heading">
          <div>
            <Text className="eyebrow">公司档案</Text>
            <Title level={2}>{detail?.name ?? '公司详情'}</Title>
            <Text type="secondary">公司下的岗位与投递进度。</Text>
          </div>
          <Space>
            <Button onClick={() => navigate('/jobs')}>返回岗位列表</Button>
            <Button onClick={() => navigate('/companies')}>返回公司管理</Button>
          </Space>
        </header>
        {detail && (
          <>
            <Card className="company-info-card">
              <Space orientation="vertical">
                <Space>
                  <Text>
                    所属行业：
                    {industries.find((industry) => industry.id === detail.industryId)?.nameZh ??
                      detail.industryId ??
                      '未分类'}
                  </Text>
                </Space>
                <Space>
                  <Text>招聘官网：{detail.careersUrl || '—'}</Text>
                  {detail.careersUrl && (
                    <Button type="link" onClick={() => openExternal(detail.careersUrl!)}>
                      在投递浏览器打开
                    </Button>
                  )}
                </Space>
                <Space>
                  <Text>公司网站：{detail.website || '—'}</Text>
                  {detail.website && (
                    <Button type="link" onClick={() => openExternal(detail.website!)}>
                      在投递浏览器打开
                    </Button>
                  )}
                </Space>
                <Text>备注：{detail.notes || '—'}</Text>
              </Space>
              <Button onClick={() => void beginEdit(detail)}>编辑公司</Button>
            </Card>
            <Card title="岗位">
              <Table rowKey="id" columns={jobColumns} dataSource={detail.jobs} pagination={false} />
            </Card>
          </>
        )}
        <CompanyForm
          open={open}
          form={form}
          editing={editing}
          industries={industries}
          onCancel={() => setOpen(false)}
          onSave={save}
        />
      </div>
    )

  return (
    <div className="page">
      {contextHolder}
      <header className="page-heading">
        <div>
          <Text className="eyebrow">公司档案</Text>
          <Title level={2}>公司管理</Title>
          <Text type="secondary">维护公司信息，并从离线常见公司库快速建档。</Text>
        </div>
        <Space>
          <Button onClick={() => navigate('/jobs')}>返回岗位</Button>
          <Button type="primary" onClick={() => void beginEdit()}>
            添加公司
          </Button>
        </Space>
      </header>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key)
          if (key === 'directory') void loadDirectory('', industryFilter)
        }}
        items={[
          {
            key: 'mine',
            label: '我的公司',
            children: (
              <Card>
                <Table
                  rowKey="id"
                  dataSource={companies}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: '公司',
                      dataIndex: 'name',
                      render: (name: string, company: Company) => (
                        <button
                          className="job-title-button"
                          onClick={() => navigate(`/companies/${company.id}`)}
                        >
                          {name}
                        </button>
                      ),
                    },
                    {
                      title: '所属行业',
                      dataIndex: 'industryId',
                      render: (id?: string | null) =>
                        industries.find((industry) => industry.id === id)?.nameZh ?? id ?? '未分类',
                    },
                    {
                      title: '招聘官网',
                      dataIndex: 'careersUrl',
                      render: (url?: string | null) =>
                        url ? (
                          <Button type="link" onClick={() => void openExternal(url)}>
                            打开官网
                          </Button>
                        ) : (
                          '—'
                        ),
                    },
                    {
                      title: '公司网站',
                      dataIndex: 'website',
                      render: (url?: string | null) =>
                        url ? (
                          <Button type="link" onClick={() => void openExternal(url)}>
                            打开网站
                          </Button>
                        ) : (
                          '—'
                        ),
                    },
                    {
                      title: '操作',
                      render: (_: unknown, company: Company) => (
                        <Space>
                          <Button type="link" onClick={() => void beginEdit(company)}>
                            编辑
                          </Button>
                          <Button type="link" danger onClick={() => archive(company)}>
                            归档
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                  locale={{ emptyText: <Empty description="还没有公司，可手动添加或从常见公司库导入" /> }}
                />
              </Card>
            ),
          },
          {
            key: 'directory',
            label: '常见公司库',
            children: (
              <Card>
                <Space wrap className="company-directory-filters">
                  <Input
                    aria-label="搜索公司名称或别名"
                    placeholder="搜索公司名称或别名"
                    value={directoryQuery}
                    allowClear
                    onChange={(event) => {
                      setDirectoryQuery(event.target.value)
                      void loadDirectory(event.target.value, industryFilter)
                    }}
                  />
                  <Select
                    aria-label="按行业筛选"
                    placeholder="全部行业"
                    allowClear
                    value={industryFilter}
                    style={{ minWidth: 180 }}
                    options={industries.map((industry) => ({ value: industry.id, label: industry.nameZh }))}
                    onChange={(value) => {
                      const nextIndustry = industries.some((industry) => industry.id === value)
                        ? (value as IndustryId)
                        : undefined
                      setIndustryFilter(nextIndustry)
                      void loadDirectory(directoryQuery, nextIndustry)
                    }}
                  />
                </Space>
                <Table
                  rowKey="id"
                  loading={directoryLoading}
                  dataSource={directoryCompanies}
                  pagination={{ pageSize: 12 }}
                  locale={{ emptyText: <Empty description="没有匹配的公司，试试其他名称或行业" /> }}
                  columns={[
                    {
                      title: '公司',
                      dataIndex: 'name',
                      render: (name: string, entry: DirectoryCompany) => (
                        <Space orientation="vertical" size={0}>
                          <Text strong>{name}</Text>
                          {entry.aliases.length > 0 && (
                            <Text type="secondary">常见名称：{entry.aliases.join('、')}</Text>
                          )}
                        </Space>
                      ),
                    },
                    { title: '行业', dataIndex: 'industryName' },
                    {
                      title: '操作',
                      render: (_: unknown, entry: DirectoryCompany) =>
                        entry.localCompany?.archivedAt ? (
                          <Space>
                            <Text type="secondary">已归档</Text>
                            <Button type="primary" onClick={() => void addDirectoryCompany(entry)}>
                              恢复到我的公司
                            </Button>
                          </Space>
                        ) : entry.localCompany ? (
                          <Space>
                            <Button disabled>已添加</Button>
                            <Button
                              type="link"
                              onClick={() => navigate(`/companies/${entry.localCompany!.id}`)}
                            >
                              查看档案
                            </Button>
                          </Space>
                        ) : (
                          <Button type="primary" onClick={() => void addDirectoryCompany(entry)}>
                            添加到我的公司
                          </Button>
                        ),
                    },
                  ]}
                />
                <Text type="secondary">
                  目录随应用离线提供；添加后会复制到“我的公司”，你的招聘网址和备注保存在本地。
                </Text>
              </Card>
            ),
          },
        ]}
      />
      <CompanyForm
        open={open}
        form={form}
        editing={editing}
        industries={industries}
        onCancel={() => setOpen(false)}
        onSave={save}
      />
    </div>
  )
}

function CompanyForm({
  open,
  form,
  editing,
  industries,
  onCancel,
  onSave,
}: {
  open: boolean
  form: FormInstance<CompanyFields>
  editing: Company | null
  industries: Industry[]
  onCancel: () => void
  onSave: (values: CompanyFields) => void
}) {
  return (
    <Modal
      open={open}
      title={editing ? '编辑公司' : '添加公司'}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={onSave}>
        <Form.Item name="name" label="公司名称" rules={[{ required: true, message: '请填写公司名称' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="industryId" label="所属行业">
          <Select
            allowClear
            placeholder="选择行业（可选）"
            options={industries.map((industry) => ({ value: industry.id, label: industry.nameZh }))}
          />
        </Form.Item>
        <Form.Item name="careersUrl" label="招聘官网" rules={[{ type: 'url', message: '请输入有效网址' }]}>
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="website" label="公司网站" rules={[{ type: 'url', message: '请输入有效网址' }]}>
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
