import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { defaultQuestionCategories } from '../../../main/services/interviews.service'
import { fetchAllJobPages } from '../jobs/kanban-data'
import { getQuestionCategories } from './question-categories'
import { InterviewRoundField } from './InterviewRoundField'
import { useJobFlowChanges } from '../../app/useJobFlowChanges'
import {
  interviewRoundLabel,
  interviewTypeLabels,
  interviewTypes,
  type InterviewType,
} from '../../../shared/constants/interview-types'
import { useAutosave } from '../../shared/useAutosave'
import { InterviewQuestionDetailDrawer, type InterviewQuestion } from './InterviewQuestionDetailDrawer'

const { Title, Text } = Typography
type Interview = {
  id: string
  applicationId: string
  round: string
  roundNumber: number | null
  cancelledAt: string | null
  endedAt: string | null
  completedAt: string | null
  type: InterviewType
  interviewAt: string
  durationMinutes: number | null
  format: string | null
  mode: 'ONLINE' | 'OFFLINE' | null
  location: string | null
  result: string | null
  overallPerformance: string | null
  strengths: string | null
  gaps: string | null
  knowledgeGaps: string | null
  nextPrep: string | null
  companyId: string
  companyName: string
  jobId: string
  jobTitle: string
}
type Job = { id: string; applicationId: string; companyId: string; companyName: string; title: string }
type Question = {
  id: string
  interviewId: string
  question: string
  category: string
  myAnswer: string | null
  betterAnswer: string | null
  notes: string | null
}
type BankRow = Question & {
  companyName: string
  companyId: string
  jobTitle: string
  jobId: string
  occurrenceCount: number
  normalizedQuestion: string
  round: string
  occurrences?: Array<{ category: string }>
}

function dataOrThrow<T>(result: { ok: boolean; data?: T; messageZh?: string }): T {
  if (!result.ok) throw new Error(result.messageZh ?? '操作失败')
  return result.data as T
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function InterviewsPage() {
  const changeVersion = useJobFlowChanges(['jobs', 'applications', 'interviews'])
  const [tab, setTab] = useState('schedule')
  const [scheduleView, setScheduleView] = useState<'upcoming' | 'past'>('upcoming')
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [selected, setSelected] = useState<Interview | null>(null)
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [bank, setBank] = useState<BankRow[]>([])
  const [selectedBankQuestion, setSelectedBankQuestion] = useState<InterviewQuestion | null>(null)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([...defaultQuestionCategories])
  const [bankFilters, setBankFilters] = useState<{
    query?: string
    category?: string
    companyId?: string
    jobId?: string
  }>({})
  const [messageApi, messageContext] = message.useMessage()
  const [scheduleForm] = Form.useForm()
  const [reviewForm] = Form.useForm()
  const [reviewReady, setReviewReady] = useState(false)
  const [questionForm] = Form.useForm()
  const addNextQuestion = useRef(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [questionSaving, setQuestionSaving] = useState(false)
  const now = Date.now()
  const reviewValues = Form.useWatch([], reviewForm) as Record<string, string | null> | undefined
  const reviewDraft = JSON.stringify(reviewValues ?? {})
  const saveReviewDraft = useCallback(
    async (serialized: string) => {
      if (!selected) return
      dataOrThrow(
        await window.jobflow.interviews.saveReview({
          id: selected.id,
          ...(JSON.parse(serialized) as Record<string, string | null>),
        }),
      )
    },
    [selected],
  )
  const reviewAutosave = useAutosave({
    value: reviewDraft,
    save: saveReviewDraft,
    revision: `${selected?.id ?? ''}:${reviewReady ? 'ready' : 'loading'}`,
    enabled: Boolean(selected && reviewReady),
    delayMs: 600,
  })

  const loadSchedule = useCallback(async () => {
    try {
      setInterviews(dataOrThrow(await window.jobflow.interviews.list()) as Interview[])
      const result = await fetchAllJobPages((page, pageSize) =>
        window.jobflow.jobs.list({ page: { page, pageSize }, filters: {} }),
      )
      setJobs(result.items)
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }, [messageApi])
  async function loadQuestions(interview: Interview) {
    setReviewReady(false)
    setSelected(interview)
    reviewForm.resetFields()
    try {
      const detail = dataOrThrow(await window.jobflow.interviews.get({ id: interview.id })) as Interview
      reviewForm.setFieldsValue(detail)
      setReviewReady(true)
      setQuestions(
        dataOrThrow(await window.jobflow.interviews.questions.list({ id: interview.id })) as Question[],
      )
      setEditingQuestion(null)
      questionForm.resetFields()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  const loadBank = useCallback(
    async (filters: typeof bankFilters) => {
      try {
        const rows = dataOrThrow(await window.jobflow.interviews.questionBank.search(filters)) as BankRow[]
        setBank(rows)
        if (!Object.values(filters).some(Boolean))
          setCategoryOptions(
            getQuestionCategories(
              rows.flatMap((row) => [
                row.category,
                ...(row.occurrences ?? []).map((occurrence) => occurrence.category),
              ]),
            ),
          )
      } catch (error) {
        messageApi.error((error as Error).message)
      }
    },
    [messageApi],
  )
  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])
  useEffect(() => {
    if (changeVersion) void loadSchedule()
  }, [changeVersion, loadSchedule])
  useEffect(() => {
    if (tab === 'bank') void loadBank(bankFilters)
  }, [tab, loadBank, bankFilters])

  async function schedule(values: {
    applicationId: string
    roundMode: string
    customRoundNumber?: number
    interviewAt: string
    type: string
    durationMinutes?: number
    mode?: 'ONLINE' | 'OFFLINE'
    location?: string
  }) {
    try {
      const roundNumber = values.roundMode === 'CUSTOM' ? values.customRoundNumber! : Number(values.roundMode)
      const input = {
        roundNumber,
        interviewAt: new Date(values.interviewAt).toISOString(),
        type: values.type as 'TECHNICAL' | 'HR' | 'MANAGER' | 'CROSS_FUNCTIONAL' | 'OTHER',
        durationMinutes: values.durationMinutes,
        mode: values.mode,
        location: values.location,
      }
      if (editingInterview) {
        dataOrThrow(await window.jobflow.interviews.update({ ...input, id: editingInterview.id }))
        messageApi.success('面试轮次已更新')
      } else {
        dataOrThrow(await window.jobflow.interviews.create({ ...input, applicationId: values.applicationId }))
        messageApi.success('面试轮次已安排')
      }
      scheduleForm.resetFields()
      setEditingInterview(null)
      await loadSchedule()
      if (selected?.id === editingInterview?.id && editingInterview) {
        const refreshed = dataOrThrow(
          await window.jobflow.interviews.get({ id: editingInterview.id }),
        ) as Interview | null
        if (refreshed) await loadQuestions(refreshed)
      }
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  function editInterview(interview: Interview) {
    setEditingInterview(interview)
    scheduleForm.setFieldsValue({
      applicationId: interview.applicationId,
      roundMode:
        interview.roundNumber && interview.roundNumber > 3 ? 'CUSTOM' : String(interview.roundNumber ?? 1),
      customRoundNumber:
        interview.roundNumber && interview.roundNumber > 3 ? interview.roundNumber : undefined,
      interviewAt: toLocalDateTimeInput(interview.interviewAt),
      type: interview.type,
      durationMinutes: interview.durationMinutes ?? undefined,
      mode: interview.mode ?? undefined,
      location: interview.location ?? undefined,
    })
  }
  async function deleteInterview(interview: Interview) {
    try {
      dataOrThrow(await window.jobflow.interviews.delete({ id: interview.id }))
      if (selected?.id === interview.id) {
        setSelected(null)
        setQuestions([])
      }
      if (editingInterview?.id === interview.id) {
        setEditingInterview(null)
        scheduleForm.resetFields()
      }
      messageApi.success('面试日程已取消，日程、题目和复盘记录仍保留')
      await loadSchedule()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function deletePastInterview(interview: Interview) {
    try {
      dataOrThrow(await window.jobflow.interviews.deletePast({ id: interview.id, confirm: true }))
      if (selected?.id === interview.id) {
        setSelected(null)
        setQuestions([])
      }
      if (editingInterview?.id === interview.id) {
        setEditingInterview(null)
        scheduleForm.resetFields()
      }
      messageApi.success('历史面试及其关联记录已删除')
      await loadSchedule()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function setInterviewType(interview: Interview, type: InterviewType) {
    try {
      dataOrThrow(await window.jobflow.interviews.setType({ id: interview.id, type }))
      messageApi.success('面试类型已同步更新')
      await loadSchedule()
      if (selected?.id === interview.id) await loadQuestions({ ...interview, type })
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function saveQuestion(values: {
    question: string
    category: string
    myAnswer?: string
    betterAnswer?: string
    notes?: string
  }) {
    if (!selected) return
    const continueAdding = addNextQuestion.current && !editingQuestion
    addNextQuestion.current = false
    if (questionSaving) return
    setQuestionSaving(true)
    try {
      if (editingQuestion)
        dataOrThrow(await window.jobflow.interviews.questions.update({ id: editingQuestion.id, ...values }))
      else dataOrThrow(await window.jobflow.interviews.questions.add({ interviewId: selected.id, ...values }))
      setQuestions(
        dataOrThrow(await window.jobflow.interviews.questions.list({ id: selected.id })) as Question[],
      )
      questionForm.resetFields()
      if (continueAdding) questionForm.setFieldsValue({ category: values.category })
      setEditingQuestion(null)
      messageApi.success(continueAdding ? '本题已保存，可以继续添加下一题' : '题目已保存')
      if (continueAdding)
        window.setTimeout(
          () => document.querySelector<HTMLTextAreaElement>('.interview-question-form textarea')?.focus(),
          0,
        )
    } catch (error) {
      messageApi.error((error as Error).message)
    } finally {
      setQuestionSaving(false)
    }
  }
  async function deleteQuestion(id: string) {
    if (!selected) return
    try {
      dataOrThrow(await window.jobflow.interviews.questions.delete({ id }))
      setQuestions(
        dataOrThrow(await window.jobflow.interviews.questions.list({ id: selected.id })) as Question[],
      )
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }

  const upcoming = interviews.filter((item) => Date.parse(item.interviewAt) >= now)
  const past = interviews.filter((item) => Date.parse(item.interviewAt) < now).reverse()
  const categories = categoryOptions

  return (
    <div className="page">
      {messageContext}
      <Text className="eyebrow">面试准备</Text>
      <Title level={2}>面试与题库</Title>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'schedule',
            label: '面试日程',
            children: (
              <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                <Card title={editingInterview ? '编辑面试轮次' : '安排新一轮面试'}>
                  <Form
                    form={scheduleForm}
                    layout="vertical"
                    onFinish={schedule}
                    initialValues={{ type: 'TECHNICAL', durationMinutes: 60, roundMode: '1' }}
                    className="compact-form interview-schedule-form"
                  >
                    <Form.Item
                      name="applicationId"
                      label="公司 / 岗位"
                      rules={[{ required: true, message: '请选择投递记录' }]}
                      style={{ minWidth: 250 }}
                    >
                      <Select
                        disabled={Boolean(editingInterview)}
                        showSearch
                        optionFilterProp="label"
                        options={jobs.map((job) => ({
                          value: job.applicationId,
                          label: `${job.companyName} · ${job.title}`,
                        }))}
                        placeholder="选择已记录岗位"
                      />
                    </Form.Item>
                    <InterviewRoundField />
                    <Form.Item name="interviewAt" label="时间" rules={[{ required: true }]}>
                      <Input type="datetime-local" />
                    </Form.Item>
                    <Form.Item name="type" label="类型">
                      <Select
                        style={{ width: 130 }}
                        options={[
                          ['TECHNICAL', '技术面'],
                          ['HR', 'HR面'],
                          ['MANAGER', '主管面'],
                          ['CROSS_FUNCTIONAL', '交叉面'],
                          ['OTHER', '其他'],
                        ].map(([value, label]) => ({ value, label }))}
                      />
                    </Form.Item>
                    <Form.Item name="durationMinutes" label="时长（分钟）">
                      <InputNumber min={1} max={1440} />
                    </Form.Item>
                    <Form.Item name="mode" label="形式">
                      <Select
                        allowClear
                        placeholder="选择面试形式"
                        options={[
                          { value: 'ONLINE', label: '线上' },
                          { value: 'OFFLINE', label: '线下' },
                        ]}
                        onChange={() => scheduleForm.setFieldValue('location', undefined)}
                      />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(previous, current) => previous.mode !== current.mode}>
                      {({ getFieldValue }) =>
                        getFieldValue('mode') ? (
                          <Form.Item
                            name="location"
                            label={
                              getFieldValue('mode') === 'ONLINE' ? '会议网址（可选）' : '面试地址（可选）'
                            }
                          >
                            <Input
                              type={getFieldValue('mode') === 'ONLINE' ? 'url' : 'text'}
                              placeholder={getFieldValue('mode') === 'ONLINE' ? 'https://…' : '填写线下地址'}
                            />
                          </Form.Item>
                        ) : null
                      }
                    </Form.Item>
                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit">
                          {editingInterview ? '保存修改' : '安排面试'}
                        </Button>
                        {editingInterview && (
                          <Button
                            onClick={() => {
                              setEditingInterview(null)
                              scheduleForm.resetFields()
                            }}
                          >
                            取消编辑
                          </Button>
                        )}
                      </Space>
                    </Form.Item>
                  </Form>
                </Card>
                <Segmented
                  block
                  value={scheduleView}
                  onChange={(value) => setScheduleView(value as 'upcoming' | 'past')}
                  options={[
                    { label: `即将到来 ${upcoming.length}`, value: 'upcoming' },
                    { label: `历史面试 ${past.length}`, value: 'past' },
                  ]}
                />
                <List
                  bordered
                  dataSource={scheduleView === 'upcoming' ? upcoming : past}
                  locale={{ emptyText: '还没有面试记录，安排第一轮面试吧。' }}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button key="open" type="link" onClick={() => void loadQuestions(item)}>
                          查看复盘
                        </Button>,
                        item.cancelledAt && !item.endedAt ? (
                          <Button
                            key="reschedule"
                            type="link"
                            onClick={() => {
                              setEditingInterview(null)
                              scheduleForm.setFieldsValue({
                                applicationId: item.applicationId,
                                roundMode:
                                  item.roundNumber && item.roundNumber > 3
                                    ? 'CUSTOM'
                                    : String(item.roundNumber ?? 1),
                                customRoundNumber:
                                  item.roundNumber && item.roundNumber > 3 ? item.roundNumber : undefined,
                                interviewAt: toLocalDateTimeInput(item.interviewAt),
                                type: item.type,
                                durationMinutes: item.durationMinutes ?? undefined,
                                mode: item.mode ?? undefined,
                                location: item.location ?? undefined,
                              })
                            }}
                          >
                            重新安排
                          </Button>
                        ) : (
                          <Button key="edit" type="link" onClick={() => editInterview(item)}>
                            编辑
                          </Button>
                        ),
                        scheduleView === 'upcoming' && !item.cancelledAt && !item.completedAt ? (
                          <Popconfirm
                            key="cancel"
                            title="取消这轮面试？"
                            description="日程和题目、复盘会保留，可以之后重新安排。"
                            okText="取消日程"
                            cancelText="返回"
                            onConfirm={() => void deleteInterview(item)}
                          >
                            <Button type="link" danger>
                              取消
                            </Button>
                          </Popconfirm>
                        ) : null,
                        scheduleView === 'past' ? (
                          <Popconfirm
                            key="delete"
                            title="永久删除这轮历史面试？"
                            description="本轮面试、题目、复盘和自动时间线标记都会永久删除，其他轮次与手动记录会保留。"
                            okText="永久删除"
                            cancelText="返回"
                            onConfirm={() => void deletePastInterview(item)}
                          >
                            <Button type="link" danger aria-label={`删除历史面试：${item.round}`}>
                              删除记录
                            </Button>
                          </Popconfirm>
                        ) : null,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong>
                              {item.companyName} · {item.jobTitle}
                            </Text>
                            <Tag>{item.roundNumber ? interviewRoundLabel(item.roundNumber) : item.round}</Tag>
                            <Select
                              aria-label={`面试类型：${item.jobTitle} ${item.round}`}
                              size="small"
                              value={item.type}
                              options={interviewTypes.map((type) => ({
                                value: type,
                                label: interviewTypeLabels[type],
                              }))}
                              onChange={(type: InterviewType) => void setInterviewType(item, type)}
                            />
                            {item.cancelledAt && <Tag>已取消</Tag>}
                            {item.endedAt && <Tag>已结束</Tag>}
                            {item.completedAt && <Tag color="green">已完成</Tag>}
                          </Space>
                        }
                        description={`${new Date(item.interviewAt).toLocaleString('zh-CN')} · ${item.mode === 'ONLINE' ? '线上' : item.mode === 'OFFLINE' ? '线下' : item.format || '面试形式待补充'}${item.location ? ` · ${item.location}` : ''}${item.result ? ` · 结果：${item.result}` : ''}`}
                      />
                    </List.Item>
                  )}
                />
                {selected && (
                  <Card
                    title={`${selected.companyName} · ${selected.jobTitle} · ${selected.round}`}
                    extra={
                      <Button
                        type="text"
                        onClick={() => {
                          setReviewReady(false)
                          setSelected(null)
                          setQuestions([])
                        }}
                      >
                        收起
                      </Button>
                    }
                  >
                    {reviewReady ? (
                      <Form form={reviewForm} layout="vertical" className="compact-form">
                        <Space wrap style={{ width: '100%' }}>
                          <Form.Item name="result" label="面试结果">
                            <Input placeholder="待定 / 通过 / 未通过" />
                          </Form.Item>
                          <Form.Item name="overallPerformance" label="整体表现">
                            <Input />
                          </Form.Item>
                        </Space>
                        <Form.Item name="strengths" label="发挥较好的地方">
                          <Input.TextArea rows={2} />
                        </Form.Item>
                        <Form.Item name="gaps" label="表达或经验短板">
                          <Input.TextArea rows={2} />
                        </Form.Item>
                        <Form.Item name="knowledgeGaps" label="知识盲区">
                          <Input.TextArea rows={2} />
                        </Form.Item>
                        <Form.Item name="nextPrep" label="下轮准备计划">
                          <Input.TextArea rows={2} />
                        </Form.Item>
                        <Space>
                          <Text
                            type={reviewAutosave.status === 'error' ? 'danger' : 'secondary'}
                            role="status"
                          >
                            {reviewAutosave.status === 'saving'
                              ? '复盘正在保存…'
                              : reviewAutosave.status === 'saved'
                                ? '复盘已自动保存'
                                : reviewAutosave.status === 'dirty'
                                  ? '复盘有未保存修改'
                                  : reviewAutosave.status === 'error'
                                    ? `复盘保存失败：${reviewAutosave.error ?? '请重试'}`
                                    : '复盘自动保存已开启'}
                          </Text>
                          {reviewAutosave.status === 'error' && (
                            <Button type="link" onClick={() => void reviewAutosave.retry()}>
                              重试
                            </Button>
                          )}
                        </Space>
                      </Form>
                    ) : (
                      <Text type="secondary">正在读取本轮复盘…</Text>
                    )}
                    <Title level={4} style={{ marginTop: 28 }}>
                      本轮题目
                    </Title>
                    <List
                      dataSource={questions}
                      locale={{ emptyText: '记录面试题目后会自动进入题库。' }}
                      renderItem={(item) => (
                        <List.Item
                          actions={[
                            <Button
                              key="edit"
                              type="link"
                              onClick={() => {
                                setEditingQuestion(item)
                                questionForm.setFieldsValue(item)
                              }}
                            >
                              编辑
                            </Button>,
                            <Button
                              key="delete"
                              type="link"
                              danger
                              onClick={() => void deleteQuestion(item.id)}
                            >
                              删除
                            </Button>,
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Space>
                                {item.question}
                                <Tag>{item.category}</Tag>
                              </Space>
                            }
                            description={
                              <div>
                                <div>我的回答：{item.myAnswer || '—'}</div>
                                <div>更好答案：{item.betterAnswer || '—'}</div>
                                <div>备注：{item.notes || '—'}</div>
                              </div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                    <Form
                      form={questionForm}
                      layout="vertical"
                      onFinish={saveQuestion}
                      className="compact-form interview-question-form"
                    >
                      <Title level={5}>{editingQuestion ? '编辑题目' : '添加本轮题目'}</Title>
                      <Form.Item
                        name="question"
                        label="题目"
                        rules={[{ required: true, whitespace: true, message: '请填写题目内容' }]}
                      >
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                        <AutoComplete
                          options={categories.map((category) => ({ value: category }))}
                          filterOption={(input, option) =>
                            String(option?.value ?? '')
                              .toLowerCase()
                              .includes(input.toLowerCase())
                          }
                          placeholder="可选择或输入新分类"
                        >
                          <Input />
                        </AutoComplete>
                      </Form.Item>
                      <Form.Item name="myAnswer" label="我的回答">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Form.Item name="betterAnswer" label="更好的回答">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Form.Item name="notes" label="复习备注">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Space wrap>
                        <Button
                          type="primary"
                          loading={questionSaving}
                          onClick={() => {
                            addNextQuestion.current = false
                            questionForm.submit()
                          }}
                        >
                          {editingQuestion ? '保存修改' : '保存题目'}
                        </Button>
                        {!editingQuestion && (
                          <Button
                            loading={questionSaving}
                            onClick={() => {
                              addNextQuestion.current = true
                              questionForm.submit()
                            }}
                          >
                            保存并添加下一题
                          </Button>
                        )}
                        {editingQuestion && (
                          <Button
                            onClick={() => {
                              setEditingQuestion(null)
                              questionForm.resetFields()
                            }}
                          >
                            取消编辑
                          </Button>
                        )}
                      </Space>
                    </Form>
                  </Card>
                )}
              </Space>
            ),
          },
          {
            key: 'bank',
            label: '面试题库',
            children: (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Card title="搜索历史面试题">
                  <Space wrap>
                    <Input.Search
                      allowClear
                      placeholder="搜索题目文字"
                      style={{ width: 260 }}
                      onSearch={(query) => {
                        const next = { ...bankFilters, query: query || undefined }
                        setBankFilters(next)
                        void loadBank(next)
                      }}
                    />
                    <Select
                      allowClear
                      placeholder="分类"
                      style={{ width: 160 }}
                      options={categories.map((category) => ({ value: category, label: category }))}
                      onChange={(category) => {
                        const next = { ...bankFilters, category }
                        setBankFilters(next)
                        void loadBank(next)
                      }}
                    />
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="公司"
                      style={{ width: 180 }}
                      options={[
                        ...new Map(
                          jobs.map((job) => [
                            job.companyId,
                            { value: job.companyId, label: job.companyName },
                          ]),
                        ).values(),
                      ]}
                      onChange={(companyId) => {
                        const next = { ...bankFilters, companyId, jobId: undefined }
                        setBankFilters(next)
                        void loadBank(next)
                      }}
                    />
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="岗位"
                      style={{ width: 230 }}
                      options={jobs
                        .filter((job) => !bankFilters.companyId || job.companyId === bankFilters.companyId)
                        .map((job) => ({ value: job.id, label: `${job.companyName} · ${job.title}` }))}
                      onChange={(jobId) => {
                        const next = { ...bankFilters, jobId }
                        setBankFilters(next)
                        void loadBank(next)
                      }}
                    />
                    <Button
                      onClick={() => {
                        setBankFilters({})
                        void loadBank({})
                      }}
                    >
                      清空筛选
                    </Button>
                  </Space>
                </Card>
                <List
                  bordered
                  dataSource={bank}
                  locale={{ emptyText: '没有匹配题目。题目按文字规范化后的完全相同内容统计次数。' }}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Button
                              type="link"
                              className="question-bank-title"
                              onClick={() => setSelectedBankQuestion(item)}
                            >
                              {item.question}
                            </Button>
                            <Tag>{item.category}</Tag>
                            <Tag color="blue">出现 {item.occurrenceCount} 次</Tag>
                          </Space>
                        }
                        description={`${item.companyName} · ${item.jobTitle} · ${item.round} · ${item.myAnswer?.trim() || item.betterAnswer?.trim() ? '已记录回答' : '尚未记录回答'}`}
                      />
                    </List.Item>
                  )}
                />
              </Space>
            ),
          },
        ]}
      />
      <InterviewQuestionDetailDrawer
        question={selectedBankQuestion}
        onClose={() => setSelectedBankQuestion(null)}
        onUpdated={(updated) => {
          setSelectedBankQuestion(updated)
          void loadBank(bankFilters)
        }}
      />
    </div>
  )
}
