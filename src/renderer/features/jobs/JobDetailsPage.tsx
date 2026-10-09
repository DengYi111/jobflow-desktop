import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
  message,
} from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { JobUpdateInput } from '../../../shared/contracts/api'
import { stageLabels, type ApplicationStage } from '../../../shared/constants/stages'
import { JobListingForm, type ListingFields, type ListingInitialValue } from './JobListingForm'
import { ApplicationTimeline } from './ApplicationTimeline'
import { JobInterviewQuestions } from './JobInterviewQuestions'
import { JobResumeSelection } from './JobResumeSelection'
import { NextActionForm, StageSelect, SubmissionDialog } from './StageSelect'
import { useJobFlowChanges } from '../../app/useJobFlowChanges'
import { useAutosave } from '../../shared/useAutosave'

const { Title, Text } = Typography
type Result<T> = { ok: true; data: T } | { ok: false; messageZh: string }
function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}
type Detail = {
  id: string
  companyId: string
  company: { name: string; careersUrl?: string | null }
  title: string
  updatedAt: string
  city?: string
  department?: string
  jobCode?: string
  salary?: string
  deadline?: string
  requirements?: string
  notes?: string
  application: {
    id: string
    currentStage: ApplicationStage
    priority: number
    pinned: boolean | number
    nextAction?: string
    nextActionAt?: string
    appliedAt?: string
    resumeVersionId?: string | null
  }
  listings: Array<{
    id: string
    url?: string
    source?: string
    pageTitle?: string
    jdText?: string
    capturedAt: string
    deadlineSnapshot?: string
    isPrimary?: boolean | number
  }>
  tags: Array<{ id: string; name: string }>
  events: Array<{ id: string; type: string; title: string; eventAt: string; notes?: string }>
}

function JobTextAutosave({
  jobId,
  field,
  label,
  initialValue,
  updatedAt,
}: {
  jobId: string
  field: 'requirements' | 'notes'
  label: string
  initialValue?: string
  updatedAt: string
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(updatedAt)
  const save = useCallback(
    async (text: string) => {
      const result = data(
        await window.jobflow.jobs.update({ id: jobId, [field]: text.trim() || null, expectedUpdatedAt }),
      ) as { updatedAt?: string }
      if (result.updatedAt) setExpectedUpdatedAt(result.updatedAt)
    },
    [expectedUpdatedAt, field, jobId],
  )
  const autosave = useAutosave({ value, save, revision: `${jobId}:${field}:${updatedAt}`, delayMs: 600 })
  useEffect(() => {
    setExpectedUpdatedAt(updatedAt)
    if (autosave.status === 'idle' || autosave.status === 'saved') setValue(initialValue ?? '')
  }, [autosave.status, initialValue, updatedAt])
  const statusText =
    autosave.status === 'saving'
      ? '正在保存…'
      : autosave.status === 'saved'
        ? '已自动保存'
        : autosave.status === 'error'
          ? `保存失败：${autosave.error ?? '请重试'}`
          : autosave.status === 'dirty'
            ? '有未保存修改'
            : '自动保存已开启'
  return (
    <Form layout="vertical" className="compact-form">
      <Form.Item label={label}>
        <Input.TextArea
          rows={field === 'requirements' ? 4 : 6}
          maxLength={10000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void autosave.flush()}
        />
      </Form.Item>
      <Space>
        <Text type={autosave.status === 'error' ? 'danger' : 'secondary'} role="status">
          {statusText}
        </Text>
        {autosave.status === 'error' && (
          <Button type="link" onClick={() => void autosave.retry()}>
            重试
          </Button>
        )}
      </Space>
    </Form>
  )
}

export function JobDetailsPage() {
  const changeVersion = useJobFlowChanges(['companies', 'jobs', 'applications', 'interviews'])
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [listingFormOpen, setListingFormOpen] = useState(false)
  const [listingEditing, setListingEditing] = useState<ListingInitialValue>()
  const [listingSaving, setListingSaving] = useState(false)
  const [submissionOpen, setSubmissionOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const openExternal = (url: string) => navigate(`/browser?url=${encodeURIComponent(url)}`)
  const load = useCallback(async () => {
    if (!jobId) return
    const value = data(await window.jobflow.jobs.get({ id: jobId })) as Detail | null
    setDetail(value)
    if (value)
      form.setFieldsValue({
        ...value,
        city: value.city ?? '',
        department: value.department ?? '',
        jobCode: value.jobCode ?? '',
        salary: value.salary ?? '',
        requirements: undefined,
        priority: value.application.priority,
        pinned: Boolean(value.application.pinned),
        nextAction: value.application.nextAction ?? '',
        nextActionAt: value.application.nextActionAt ?? '',
      })
  }, [form, jobId])
  useEffect(() => {
    void load().catch((error) => messageApi.error(error.message))
    void window.jobflow.companies
      .list()
      .then((result) => setCompanies(data(result) as Array<{ id: string; name: string }>))
  }, [jobId, load, messageApi])
  useEffect(() => {
    if (changeVersion) void load().catch((error) => messageApi.error(error.message))
  }, [changeVersion, load, messageApi])
  const save = async (values: JobUpdateInput) => {
    if (!jobId || !detail) return
    try {
      const fields = { ...values }
      delete fields.deadline
      data(await window.jobflow.jobs.update({ ...fields, id: jobId, expectedUpdatedAt: detail.updatedAt }))
      messageApi.success('岗位信息已保存')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    }
  }
  const saveListing = async (values: ListingFields) => {
    if (!jobId) return
    setListingSaving(true)
    try {
      if (listingEditing)
        data(
          await window.jobflow.jobs.updateListing({
            id: listingEditing.id,
            url: values.url,
            source: values.source,
            pageTitle: values.pageTitle,
            capturedAt: values.capturedAt,
          }),
        )
      else data(await window.jobflow.jobs.addListing({ jobId, ...values }))
      messageApi.success(listingEditing ? '快照信息已更新，JD 原文保持不变' : '招聘快照已添加')
      setListingFormOpen(false)
      setListingEditing(undefined)
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '快照保存失败')
    } finally {
      setListingSaving(false)
    }
  }
  if (!detail)
    return (
      <div className="page">
        <Form form={form} style={{ display: 'none' }} />
        <Button onClick={() => navigate('/jobs')}>返回岗位</Button>
        <Empty description="没有找到岗位记录" />
        {contextHolder}
      </div>
    )
  const overview = (
    <Form form={form} layout="vertical" onFinish={save} className="compact-form">
      <div className="job-form-grid">
        <Form.Item name="companyId" label="公司">
          <Select
            showSearch
            optionFilterProp="label"
            options={companies.map((company) => ({ value: company.id, label: company.name }))}
          />
        </Form.Item>
        <Form.Item name="title" label="岗位名称" rules={[{ required: true, message: '请填写岗位名称' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="city" label="城市">
          <Input />
        </Form.Item>
        <Form.Item name="department" label="部门">
          <Input />
        </Form.Item>
        <Form.Item name="jobCode" label="岗位编号">
          <Input />
        </Form.Item>
        <Form.Item name="salary" label="薪资">
          <Input />
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
      </div>
      <Button type="primary" htmlType="submit">
        保存修改
      </Button>
    </Form>
  )
  const listingContent = (
    <Space orientation="vertical" size="middle" className="full-width">
      <div className="snapshot-heading">
        <Text type="secondary">每份快照保留各自采集时的原始 JD。</Text>
        <Button
          type="primary"
          onClick={() => {
            setListingEditing(undefined)
            setListingFormOpen(true)
          }}
        >
          添加 JD 快照
        </Button>
      </div>
      {detail.listings.length ? (
        detail.listings.map((listing) => (
          <Card
            key={listing.id}
            size="small"
            title={listing.pageTitle || listing.source || '招聘页面快照'}
            extra={
              <Space>
                <Text type="secondary">采集于 {listing.capturedAt.slice(0, 16).replace('T', ' ')}</Text>
                <Button
                  type="link"
                  onClick={() => {
                    setListingEditing(listing)
                    setListingFormOpen(true)
                  }}
                >
                  编辑来源信息
                </Button>
              </Space>
            }
          >
            <Space orientation="vertical" className="full-width">
              <Text>来源：{listing.source || '未填写'}</Text>
              {listing.url && (
                <Button
                  type="link"
                  className="external-link-button"
                  onClick={() => openExternal(listing.url!)}
                >
                  在投递浏览器打开
                </Button>
              )}
              <Input.TextArea
                readOnly
                value={listing.jdText || '未保存 JD 原文'}
                autoSize={{ minRows: 4, maxRows: 14 }}
              />
            </Space>
          </Card>
        ))
      ) : (
        <Empty description="尚未保存招聘页面快照" />
      )}
    </Space>
  )
  const tabs = [
    { key: 'overview', label: '概览', children: overview },
    {
      key: 'flow',
      label: '流程',
      children: (
        <Space orientation="vertical" size="large" className="full-width">
          <Card
            title="投递信息"
            extra={
              <StageSelect
                id={detail.application.id}
                value={detail.application.currentStage}
                onChanged={() => void load()}
                onSubmitRequested={() => setSubmissionOpen(true)}
              />
            }
          >
            <Descriptions column={2}>
              <Descriptions.Item key="stage" label="当前阶段">
                {stageLabels['zh-CN'][detail.application.currentStage]}
              </Descriptions.Item>
              <Descriptions.Item key="priority" label="优先级">
                {detail.application.priority === 1 ? '高' : detail.application.priority === 2 ? '普通' : '低'}
              </Descriptions.Item>
              <Descriptions.Item key="appliedAt" label="投递日期">
                {detail.application.appliedAt?.slice(0, 10) || '尚未投递'}
              </Descriptions.Item>
              <Descriptions.Item key="nextAction" label="下一步">
                {detail.application.nextAction || '未安排'}
              </Descriptions.Item>
            </Descriptions>
            <NextActionForm
              id={detail.application.id}
              initialAction={detail.application.nextAction}
              initialAt={detail.application.nextActionAt}
              onSaved={() => void load()}
            />
          </Card>
          <Card>
            <ApplicationTimeline applicationId={detail.application.id} onChanged={() => void load()} />
          </Card>
        </Space>
      ),
    },
    { key: 'jd', label: 'JD', children: listingContent },
    {
      key: 'interviews',
      label: '面试',
      children: <JobInterviewQuestions applicationId={detail.application.id} refreshKey={changeVersion} />,
    },
    {
      key: 'materials',
      label: '资料',
      children: (
        <JobResumeSelection
          applicationId={detail.application.id}
          resumeVersionId={detail.application.resumeVersionId ?? null}
          onChanged={() => void load()}
        />
      ),
    },
    {
      key: 'notes',
      label: '备注',
      children: (
        <Space orientation="vertical" size="large" className="full-width">
          <JobTextAutosave
            key={`${jobId}:requirements`}
            jobId={jobId!}
            field="requirements"
            label="岗位要求"
            initialValue={detail.requirements}
            updatedAt={detail.updatedAt}
          />
          <JobTextAutosave
            key={`${jobId}:notes`}
            jobId={jobId!}
            field="notes"
            label="岗位备注"
            initialValue={detail.notes}
            updatedAt={detail.updatedAt}
          />
        </Space>
      ),
    },
  ]
  const recruitingUrl =
    detail.listings.find((listing) => listing.isPrimary && listing.url)?.url ??
    detail.listings.find((listing) => listing.url)?.url ??
    detail.company?.careersUrl
  return (
    <div className="page job-detail-page">
      {contextHolder}
      <SubmissionDialog
        id={detail.application.id}
        open={submissionOpen}
        onOpenChange={setSubmissionOpen}
        showTrigger={false}
        onSubmitted={() => void load()}
      />
      <header className="page-heading">
        <div>
          <Text className="eyebrow">
            {detail.company?.name || '公司'} · {detail.city || '地点待补充'}
          </Text>
          <Title level={2}>{detail.title}</Title>
        </div>
        <Space>
          <Button onClick={() => navigate('/jobs')}>返回岗位列表</Button>
          {recruitingUrl && (
            <Button icon={<LinkOutlined />} onClick={() => openExternal(recruitingUrl)}>
              打开投递官网
            </Button>
          )}
        </Space>
      </header>
      <Card className="job-detail-card">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
      </Card>
      <JobListingForm
        open={listingFormOpen}
        initial={listingEditing}
        loading={listingSaving}
        onCancel={() => {
          setListingFormOpen(false)
          setListingEditing(undefined)
        }}
        onSubmit={(values) => void saveListing(values)}
      />
    </div>
  )
}
