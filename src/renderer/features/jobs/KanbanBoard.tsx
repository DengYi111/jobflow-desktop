import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import { Button, Modal, Select, Tag, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { JobSummary } from '../../../shared/contracts/api'
import type { CloseReason } from '../../../shared/contracts/api'
import {
  selectableApplicationStages,
  stageLabels,
  type ApplicationStage,
} from '../../../shared/constants/stages'
import { SubmissionDialog } from './StageSelect'
import { InterviewScheduleDialog } from '../interviews/InterviewScheduleDialog'
import type { InterviewType } from '../../../shared/constants/interview-types'
import { buildKanbanColumns, fetchAllJobPages } from './kanban-data'

const reasons: Array<{ value: CloseReason; label: string }> = [
  { value: 'REJECTED', label: '未通过' },
  { value: 'VOLUNTARY', label: '主动退出' },
  { value: 'HC_CLOSED', label: '岗位关闭' },
  { value: 'NO_RESPONSE', label: '长期无回复' },
  { value: 'OFFER_DECLINED', label: '拒绝 Offer' },
  { value: 'OTHER', label: '其他' },
]

function CompanyTile({
  companyName,
  count,
  color,
  expanded,
  onClick,
  onDragStart,
  testId,
  children,
}: {
  companyName: string
  count: number
  color: string
  expanded?: boolean
  onClick: () => void
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
  testId?: string
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className="kanban-company-tile"
      data-testid={testId}
      style={{ '--company-tile-color': color } as CSSProperties}
      aria-expanded={expanded}
      draggable={Boolean(onDragStart)}
      onClick={onClick}
      onDragStart={onDragStart}
    >
      <span className="kanban-company-name" title={`${companyName}${count > 1 ? `（${count} 个岗位）` : ''}`}>
        {companyName}
        {count > 1 ? `（${count}）` : ''}
      </span>
      {children}
    </button>
  )
}

export function KanbanBoard({
  onChanged,
  refreshToken,
}: {
  onChanged?: () => Promise<boolean | void> | boolean | void
  refreshToken?: number
}) {
  const [items, setItems] = useState<JobSummary[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<{ job: JobSummary; stage: ApplicationStage }>()
  const [submissionJob, setSubmissionJob] = useState<JobSummary>()
  const [interviewJob, setInterviewJob] = useState<{
    job: JobSummary
    roundNumber: number
    type: InterviewType
  }>()
  const [reason, setReason] = useState<CloseReason>()
  const [busyJobId, setBusyJobId] = useState<string>()
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage>()
  const mutationRefreshPending = useRef(false)
  const [msg, holder] = message.useMessage()
  const navigate = useNavigate()
  const columns = buildKanbanColumns(items)

  const load = useCallback(async () => {
    try {
      const result = await fetchAllJobPages((page, pageSize) =>
        window.jobflow.jobs.list({ page: { page, pageSize }, filters: {} }),
      )
      setItems(result.items)
      mutationRefreshPending.current = false
      return true
    } catch (error) {
      const detail = error instanceof Error ? error.message : '加载岗位看板失败'
      if (mutationRefreshPending.current) msg.warning(`阶段已保存，但看板刷新失败：${detail}`)
      else msg.error(detail)
      mutationRefreshPending.current = false
      return false
    }
  }, [msg])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const move = async (
    job: JobSummary,
    stage: ApplicationStage,
    closeReason?: CloseReason,
    cancelOpenInterviews = false,
  ) => {
    const applicationId = job.applicationId
    if (!applicationId) {
      msg.error('岗位缺少投递记录')
      return
    }
    setBusyJobId(job.id)
    try {
      const result = await window.jobflow.applications.transition({
        id: applicationId,
        stage,
        ...(closeReason ? { closeReason } : {}),
        ...(cancelOpenInterviews ? { cancelOpenInterviews: true } : {}),
      })
      if (!result.ok) throw new Error(result.messageZh)
      setPending(undefined)
      setReason(undefined)
      if (onChanged) mutationRefreshPending.current = true
      const refreshed = onChanged ? await onChanged() : await load()
      if (refreshed === false) msg.warning('阶段已保存，但页面刷新失败，请重试')
      else msg.success('阶段已更新')
    } catch (error) {
      msg.error(error instanceof Error ? error.message : '阶段更新失败')
    } finally {
      setBusyJobId(undefined)
    }
  }

  const drop = (job: JobSummary, stage: ApplicationStage) => {
    if (job.stage === stage || busyJobId) return
    if (stage === 'APPLIED') {
      setSubmissionJob(job)
      return
    }
    if (stage === 'CLOSED') {
      setPending({ job, stage })
      setReason(undefined)
      return
    }
    if (stage === 'INTERVIEW_PENDING') {
      setInterviewJob({ job, roundNumber: 1, type: 'TECHNICAL' })
      return
    }
    if (job.stage === 'INTERVIEW_PENDING') {
      Modal.confirm({
        title: '确认更改面试阶段',
        content: '此岗位有未完成的面试日程。继续后会取消这些日程，但保留面试记录、题目和复盘。',
        okText: '确认更改',
        cancelText: '返回',
        onOk: () => move(job, stage, undefined, true),
      })
      return
    }
    void move(job, stage)
  }

  const startDrag = (job: JobSummary, event: DragEvent<HTMLElement>) => {
    if (busyJobId) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/jobflow-id', job.id)
    if (job.applicationId) event.dataTransfer.setData('text/jobflow-application-id', job.applicationId)
  }

  const stageOptions = selectableApplicationStages.map((stage) => ({
    value: stage,
    label: stageLabels['zh-CN'][stage],
  }))

  return (
    <section className="dashboard-section">
      {holder}
      <div className="section-heading">
        <div>
          <Typography.Title level={4}>投递看板</Typography.Title>
          <Typography.Text type="secondary">八个流程阶段；拖动岗位色块可调整阶段</Typography.Text>
        </div>
        <Button type="link" onClick={() => navigate('/jobs')}>
          管理岗位
        </Button>
      </div>
      <div className="kanban-board">
        {columns.map((column) => (
          <div
            key={column.stage}
            data-testid={`kanban-column-${column.stage}`}
            className={`kanban-column${dragOverStage === column.stage ? ' kanban-column-drag-over' : ''}`}
            onDragEnter={() => setDragOverStage(column.stage)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDragOverStage(undefined)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverStage(undefined)
              const applicationId = event.dataTransfer.getData('text/jobflow-application-id')
              const id = event.dataTransfer.getData('text/jobflow-id')
              const job = items.find(
                (item) => item.id === id || (applicationId && item.applicationId === applicationId),
              )
              if (job) drop(job, column.stage)
            }}
          >
            <div className="kanban-column-heading">
              <strong>{column.label}</strong>
              <Tag>{column.count}</Tag>
            </div>
            <div className="kanban-column-content">
              {column.companies.map((company) => {
                const key = `${column.stage}:${company.companyId}`
                const isExpanded = expandedGroups.has(key)
                if (company.jobs.length === 1) {
                  const job = company.jobs[0]
                  const busy = busyJobId === job.id
                  return (
                    <div className="kanban-company-single" key={company.companyId} aria-busy={busy}>
                      <CompanyTile
                        companyName={company.companyName}
                        count={company.jobs.length}
                        color={company.color}
                        testId={`kanban-job-${job.id}`}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        onDragStart={(event) => startDrag(job, event)}
                      >
                        <span className="kanban-single-title" title={job.title}>
                          {job.title}
                        </span>
                      </CompanyTile>
                      <Select
                        size="small"
                        aria-label={`${job.title}阶段`}
                        value={job.stage}
                        options={stageOptions}
                        disabled={Boolean(busyJobId)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(stage: ApplicationStage) => drop(job, stage)}
                      />
                    </div>
                  )
                }

                return (
                  <div className="kanban-company-group" key={company.companyId}>
                    <CompanyTile
                      companyName={company.companyName}
                      count={company.jobs.length}
                      color={company.color}
                      expanded={isExpanded}
                      onClick={() =>
                        setExpandedGroups((current) => {
                          const next = new Set(current)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })
                      }
                    >
                      <span className="kanban-expand-hint">{isExpanded ? '收起' : '查看岗位'}</span>
                    </CompanyTile>
                    {isExpanded && (
                      <div className="kanban-company-jobs">
                        {company.jobs.map((job) => (
                          <div
                            key={job.id}
                            data-testid={`kanban-job-${job.id}`}
                            className="kanban-job-row"
                            aria-busy={busyJobId === job.id}
                            draggable={!busyJobId}
                            onDragStart={(event) => startDrag(job, event)}
                          >
                            <button
                              type="button"
                              className="kanban-job-title"
                              title={job.title}
                              onClick={() => navigate(`/jobs/${job.id}`)}
                            >
                              {job.title}
                            </button>
                            <Select
                              size="small"
                              aria-label={`${job.title}阶段`}
                              value={job.stage}
                              options={stageOptions}
                              disabled={Boolean(busyJobId)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(stage: ApplicationStage) => drop(job, stage)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <Modal
        title="结束投递流程"
        open={pending?.stage === 'CLOSED'}
        onCancel={() => {
          setPending(undefined)
          setReason(undefined)
        }}
        onOk={() => {
          if (pending && reason) void move(pending.job, 'CLOSED', reason)
        }}
        okText="确定"
        cancelText="取消"
        okButtonProps={{ disabled: !reason, loading: busyJobId === pending?.job.id }}
      >
        <p>请选择结束原因。</p>
        <Select
          aria-label="结束原因"
          value={reason}
          onChange={setReason}
          options={reasons}
          placeholder="选择原因"
          style={{ width: '100%' }}
        />
      </Modal>
      <SubmissionDialog
        id={submissionJob?.applicationId ?? ''}
        showTrigger={false}
        open={Boolean(submissionJob)}
        onOpenChange={(open) => {
          if (!open) setSubmissionJob(undefined)
        }}
        onSubmitted={async () => {
          setSubmissionJob(undefined)
          if (onChanged) {
            mutationRefreshPending.current = true
            return await onChanged()
          }
          return await load()
        }}
      />
      <InterviewScheduleDialog
        applicationId={interviewJob?.job.applicationId ?? undefined}
        open={Boolean(interviewJob)}
        onCancel={() => setInterviewJob(undefined)}
        initialRoundNumber={interviewJob?.roundNumber ?? 1}
        initialType={interviewJob?.type ?? 'TECHNICAL'}
        onSaved={() => {
          setInterviewJob(undefined)
          if (onChanged) {
            mutationRefreshPending.current = true
            void onChanged()
          } else void load()
        }}
      />
    </section>
  )
}
