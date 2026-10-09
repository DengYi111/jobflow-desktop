import { RiseOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Empty, Input, message, Modal, Select, Space, Switch, Typography } from 'antd'
import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ApiResult, DashboardActionItem, DashboardActionLane } from '../../../shared/contracts/api'
import type { InterviewType } from '../../../shared/constants/interview-types'
import {
  interviewRoundLabel,
  interviewTypeLabels,
  interviewTypes,
} from '../../../shared/constants/interview-types'
import { KanbanBoard } from '../jobs/KanbanBoard'
import { SubmissionDialog } from '../jobs/StageSelect'
import { InterviewScheduleDialog } from '../interviews/InterviewScheduleDialog'
import { useJobFlowChanges } from '../../app/useJobFlowChanges'
import { formatInterviewDate } from '../interviews/interview-local-date'

const { Title, Text } = Typography
type Summary = { actionLanes: DashboardActionLane[] }
const visibleActionLaneKeys = ['TO_APPLY', 'ASSESSMENT_PENDING', 'WRITTEN_TEST_PENDING', 'INTERVIEW'] as const
type VisibleActionLaneKey = (typeof visibleActionLaneKeys)[number]

function data<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

const laneTitles: Record<VisibleActionLaneKey, string> = {
  TO_APPLY: '待投递',
  ASSESSMENT_PENDING: '待测评',
  WRITTEN_TEST_PENDING: '待笔试',
  INTERVIEW: '待面试',
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function actionLabel(lane: VisibleActionLaneKey, item: DashboardActionItem): string {
  if (lane === 'TO_APPLY') return '标记已投递'
  if (lane === 'ASSESSMENT_PENDING') return '完成测评'
  if (lane === 'WRITTEN_TEST_PENDING') return '完成笔试'
  return item.roundNumber && item.type
    ? `${interviewRoundLabel(item.roundNumber)}·${interviewTypeLabels[item.type]}`
    : (item.round ?? '面试')
}

function actionDate(item: DashboardActionItem): string | null {
  return formatInterviewDate(item.interviewAt) || null
}

function notificationKey(lane: VisibleActionLaneKey, item: DashboardActionItem): string {
  return lane === 'INTERVIEW' ? `INTERVIEW:${item.interviewId}` : `${lane}:${item.applicationId}`
}

export function DashboardPage() {
  const changeVersion = useJobFlowChanges(['companies', 'jobs', 'applications', 'interviews'])
  const navigate = useNavigate()
  const [summary, setSummary] = useState<Summary>()
  const [loading, setLoading] = useState(true)
  const [notificationDrafts, setNotificationDrafts] = useState<Record<string, string>>({})
  const [submissionApplicationId, setSubmissionApplicationId] = useState<string>()
  const [scheduleTarget, setScheduleTarget] = useState<{
    applicationId: string
    roundNumber: number
    type: InterviewType
  }>()
  const [editingInterviewTypeId, setEditingInterviewTypeId] = useState<string>()
  const [boardRefreshToken, setBoardRefreshToken] = useState(0)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    try {
      setSummary(data(await window.jobflow.dashboard.getSummary()) as Summary)
      return true
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '首页加载失败')
      return false
    } finally {
      setLoading(false)
    }
  }, [messageApi])
  const refreshAll = useCallback(async () => {
    const refreshed = await load()
    setBoardRefreshToken((current) => current + 1)
    return refreshed
  }, [load])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (changeVersion) void refreshAll()
  }, [changeVersion, refreshAll])

  const saveNotification = async (
    lane: VisibleActionLaneKey,
    item: DashboardActionItem,
    enabled: boolean,
    notificationAt: string | null,
  ) => {
    try {
      if (lane === 'INTERVIEW')
        data(
          await window.jobflow.interviews.setNotification({ id: item.interviewId!, enabled, notificationAt }),
        )
      else
        data(
          await window.jobflow.applications.setStageNotification({
            id: item.applicationId,
            enabled,
            notificationAt,
          }),
        )
      messageApi.success(enabled ? '这项行动的桌面提醒已开启' : '这项行动的桌面提醒已关闭')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '桌面提醒保存失败')
    }
  }

  const changeNotificationTime = (
    lane: VisibleActionLaneKey,
    item: DashboardActionItem,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const key = notificationKey(lane, item)
    const value = event.target.value
    setNotificationDrafts((current) => ({ ...current, [key]: value }))
    if (!value) {
      if (item.notificationAt) void saveNotification(lane, item, false, null)
      return
    }
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime()))
      void saveNotification(lane, item, Boolean(item.notificationEnabled), parsed.toISOString())
  }

  const toggleNotification = (lane: VisibleActionLaneKey, item: DashboardActionItem, enabled: boolean) => {
    const value = notificationDrafts[notificationKey(lane, item)] ?? toLocalInput(item.notificationAt)
    const parsed = value ? new Date(value) : null
    if (enabled && (!parsed || Number.isNaN(parsed.getTime()))) {
      messageApi.warning('请先选择这项行动的提醒日期和时间')
      return
    }
    void saveNotification(
      lane,
      item,
      enabled,
      parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    )
  }

  const completeItem = async (lane: VisibleActionLaneKey, item: DashboardActionItem) => {
    if (lane === 'TO_APPLY') {
      setSubmissionApplicationId(item.applicationId)
      return
    }
    try {
      if (lane === 'ASSESSMENT_PENDING' || lane === 'WRITTEN_TEST_PENDING')
        data(await window.jobflow.applications.completeStageAction({ id: item.applicationId }))
      else data(await window.jobflow.interviews.complete({ id: item.interviewId! }))
      const refreshed = await refreshAll()
      if (refreshed) messageApi.success('已完成，记录已保存')
      else messageApi.warning('操作已保存，但部分页面刷新失败，请重试')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '完成操作失败')
    }
  }

  const changeInterviewType = async (item: DashboardActionItem, type: InterviewType) => {
    if (!item.interviewId) return
    try {
      data(await window.jobflow.interviews.setType({ id: item.interviewId, type }))
      messageApi.success('面试类型已更新')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '面试类型更新失败')
    }
  }

  const rejectInterview = (item: DashboardActionItem) =>
    Modal.confirm({
      title: '确认标记未通过？',
      content: '岗位将移入“已结束”，未完成的面试记录会标记为已结束，题目和复盘仍会保留。',
      okText: '标记未通过',
      cancelText: '返回',
      onOk: async () => {
        try {
          data(
            await window.jobflow.applications.transition({
              id: item.applicationId,
              stage: 'CLOSED',
              closeReason: 'REJECTED',
              endOpenInterviews: true,
            }),
          )
          await refreshAll()
          messageApi.success('岗位已移入已结束')
        } catch (error) {
          messageApi.error(error instanceof Error ? error.message : '面试状态更新失败')
        }
      },
    })

  const dropOnLane = async (lane: VisibleActionLaneKey, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const applicationId = event.dataTransfer.getData('text/jobflow-application-id')
    if (!applicationId) return
    if (lane === 'INTERVIEW') {
      setScheduleTarget({ applicationId, roundNumber: 1, type: 'TECHNICAL' })
      return
    }
    const stage = lane
    try {
      const result = await window.jobflow.applications.transition({ id: applicationId, stage })
      if (!result.ok) throw new Error(result.messageZh)
      const refreshed = await refreshAll()
      if (refreshed) messageApi.success(`已移入${laneTitles[lane]}`)
      else messageApi.warning('阶段已保存，但部分页面刷新失败，请重试')
    } catch (error) {
      const text = error instanceof Error ? error.message : '阶段更新失败'
      if (text.includes('确认取消')) {
        Modal.confirm({
          title: '确认更改面试阶段',
          content: '此岗位有未完成面试。继续后会取消这些日程，但保留面试记录、题目和复盘。',
          okText: '确认更改',
          cancelText: '返回',
          onOk: async () => {
            const result = await window.jobflow.applications.transition({
              id: applicationId,
              stage,
              cancelOpenInterviews: true,
            })
            if (!result.ok) throw new Error(result.messageZh)
            const refreshed = await refreshAll()
            if (refreshed) messageApi.success(`已移入${laneTitles[lane]}`)
            else messageApi.warning('阶段已保存，但部分页面刷新失败，请重试')
          },
        })
      } else messageApi.error(text)
    }
  }

  const startActionDrag = (item: DashboardActionItem, event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/jobflow-application-id', item.applicationId)
  }

  return (
    <div className="page dashboard-page">
      {contextHolder}
      <header className="page-heading">
        <div>
          <Text className="eyebrow">你的秋招中枢</Text>
          <Title level={2}>今天，先做好一件事。</Title>
          <Text type="secondary">按计划推进求职流程，及时准备每一场面试。</Text>
        </div>
        <Button
          aria-label="投递岗位"
          type="primary"
          size="large"
          icon={<RiseOutlined />}
          onClick={() => navigate('/browser')}
        >
          投递岗位
        </Button>
      </header>
      <section className="dashboard-action-grid" aria-label="求职行动">
        {visibleActionLaneKeys.map((laneKey) => {
          const lane = summary?.actionLanes.find(({ key }) => key === laneKey) ?? {
            key: laneKey,
            count: 0,
            items: [],
          }
          return (
            <Card
              key={laneKey}
              data-testid={`dashboard-action-lane-${laneKey}`}
              className="dashboard-action-lane"
              loading={loading}
              title={
                <div className="dashboard-action-lane-heading">
                  <Title level={4}>{laneTitles[laneKey]}</Title>
                  <span className="dashboard-action-count" aria-label={`${laneTitles[laneKey]}数量`}>
                    {lane.count}
                  </span>
                </div>
              }
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => void dropOnLane(laneKey, event)}
            >
              <div className="dashboard-action-list">
                {lane.items.length ? (
                  lane.items.map((item) => {
                    const key = notificationKey(laneKey, item)
                    const label = `${item.companyName} · ${laneKey === 'INTERVIEW' ? actionLabel(laneKey, item) : item.jobTitle}`
                    const date = laneKey === 'INTERVIEW' ? actionDate(item) : null
                    const notificationTime = notificationDrafts[key] ?? toLocalInput(item.notificationAt)
                    return (
                      <article
                        className="dashboard-action-item"
                        key={key}
                        draggable
                        onDragStart={(event) => startActionDrag(item, event)}
                      >
                        <div className="dashboard-action-item-top">
                          {laneKey === 'INTERVIEW' ? null : (
                            <Checkbox
                              aria-label={`${laneKey === 'TO_APPLY' ? '完成投递' : '完成'}：${item.companyName} · ${item.jobTitle}`}
                              checked={false}
                              onChange={() => void completeItem(laneKey, item)}
                            />
                          )}
                          {laneKey === 'INTERVIEW' && item.interviewId ? (
                            editingInterviewTypeId === item.interviewId ? (
                              <Select
                                autoFocus
                                size="small"
                                aria-label={`面试类型：${item.companyName} · ${item.jobTitle}`}
                                value={item.type ?? 'TECHNICAL'}
                                options={interviewTypes.map((type) => ({
                                  value: type,
                                  label: interviewTypeLabels[type],
                                }))}
                                onChange={(type: InterviewType) => {
                                  setEditingInterviewTypeId(undefined)
                                  void changeInterviewType(item, type)
                                }}
                              />
                            ) : (
                              <Button
                                type="link"
                                className="dashboard-action-title"
                                title="点击修改面试类型"
                                onClick={() => setEditingInterviewTypeId(item.interviewId)}
                              >
                                {actionLabel(laneKey, item)}
                              </Button>
                            )
                          ) : (
                            <Button
                              type="link"
                              className="dashboard-action-title"
                              title={actionLabel(laneKey, item)}
                              onClick={() => navigate(`/jobs/${item.jobId}`)}
                            >
                              {actionLabel(laneKey, item)}
                            </Button>
                          )}
                        </div>
                        <Link
                          className="dashboard-action-job"
                          to={
                            laneKey === 'TO_APPLY' && item.postingUrl
                              ? `/browser?url=${encodeURIComponent(item.postingUrl)}`
                              : `/jobs/${item.jobId}`
                          }
                          title={`${item.companyName} · ${item.jobTitle}`}
                        >
                          {item.companyName} · {item.jobTitle}
                        </Link>
                        {date && (
                          <Text className="dashboard-action-date" type="secondary">
                            {date}
                          </Text>
                        )}
                        {laneKey === 'INTERVIEW' && item.interviewId && (
                          <div className="dashboard-interview-controls">
                            <Checkbox
                              aria-label={`下一面：${item.companyName} · ${item.jobTitle}`}
                              checked={false}
                              onChange={(event) => {
                                if (event.target.checked)
                                  setScheduleTarget({
                                    applicationId: item.applicationId,
                                    roundNumber: (item.roundNumber ?? 0) + 1 || 1,
                                    type: item.type ?? 'TECHNICAL',
                                  })
                              }}
                            >
                              下一面
                            </Checkbox>
                            <Checkbox
                              aria-label={`已完成全部面试：${item.companyName} · ${item.jobTitle}`}
                              checked={false}
                              onChange={() => void completeItem(laneKey, item)}
                            >
                              已完成全部面试
                            </Checkbox>
                            <Checkbox
                              aria-label={`已被拒：${item.companyName} · ${item.jobTitle}`}
                              checked={false}
                              onChange={(event) => {
                                if (event.target.checked) rejectInterview(item)
                              }}
                            >
                              已被拒
                            </Checkbox>
                          </div>
                        )}
                        {laneKey !== 'TO_APPLY' && (
                          <div className="dashboard-action-reminder dashboard-action-reminder-row">
                            <Input
                              aria-label={`提醒日期时间：${label}`}
                              type="datetime-local"
                              value={notificationTime}
                              onChange={(event) => changeNotificationTime(laneKey, item, event)}
                            />
                            <Space size={6} className="dashboard-action-notification">
                              <Text type="secondary">桌面通知</Text>
                              <Switch
                                aria-label={`桌面通知：${label}`}
                                checked={Boolean(item.notificationEnabled)}
                                onChange={(enabled) => toggleNotification(laneKey, item, enabled)}
                              />
                            </Space>
                          </div>
                        )}
                      </article>
                    )
                  })
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={`暂无${laneTitles[laneKey]}事项`}
                  />
                )}
              </div>
            </Card>
          )
        })}
      </section>
      <KanbanBoard onChanged={refreshAll} refreshToken={boardRefreshToken} />
      <InterviewScheduleDialog
        applicationId={scheduleTarget?.applicationId}
        open={Boolean(scheduleTarget)}
        initialRoundNumber={scheduleTarget?.roundNumber ?? 1}
        initialType={scheduleTarget?.type ?? 'TECHNICAL'}
        onCancel={() => setScheduleTarget(undefined)}
        onSaved={() => {
          setScheduleTarget(undefined)
          void refreshAll()
        }}
      />
      <SubmissionDialog
        id={submissionApplicationId ?? ''}
        open={Boolean(submissionApplicationId)}
        showTrigger={false}
        onOpenChange={(open) => {
          if (!open) setSubmissionApplicationId(undefined)
        }}
        onSubmitted={refreshAll}
      />
    </div>
  )
}
