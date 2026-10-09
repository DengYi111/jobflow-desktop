import { useState } from 'react'
import { AutoComplete, Button, Table, Typography, Select, Popconfirm } from 'antd'
import type { TableProps } from 'antd'
import { Link } from 'react-router-dom'
import type { ApplicationStage } from '../../../shared/constants/stages'
import { jobsPageSizes } from './jobs-page-size'
import { StageSelect, SubmissionDialog } from './StageSelect'

export interface JobRow {
  id: string
  applicationId: string
  companyId: string
  companyName: string
  title: string
  city: string | null
  stage: ApplicationStage
  priority: number
  pinned: boolean | number
  nextAction: string | null
  nextActionAt: string | null
  deadline: string | null
  appliedAt: string | null
  updatedAt: string
  primaryListingUrl?: string | null
}

type JobsTableSort = 'updatedAt' | 'priority' | 'appliedAt' | null

export function JobTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  loading,
  onPageChange,
  onOpen,
  onSort,
  onUpdatePriority,
  onUpdateNextAction,
  onStageChanged,
  onDelete,
}: {
  rows: JobRow[]
  total: number
  page: number
  pageSize: number
  loading?: boolean
  onPageChange: (page: number, pageSize: number) => void
  sort: JobsTableSort
  direction: 'asc' | 'desc'
  onOpen: (id: string) => void
  onSort: (sort: JobsTableSort, direction: 'asc' | 'desc') => void
  onUpdatePriority: (jobId: string, priority: 1 | 2 | 3) => void | Promise<void>
  onUpdateNextAction: (jobId: string, nextAction: string) => Promise<boolean>
  onStageChanged: () => void
  onDelete: (id: string) => void
}) {
  const [editingAction, setEditingAction] = useState<{ jobId: string; value: string } | null>(null)
  const [submissionTarget, setSubmissionTarget] = useState<JobRow | null>(null)
  const suggestions = [
    ...new Set(
      rows.map((row) => row.nextAction?.trim()).filter((action): action is string => Boolean(action)),
    ),
  ].map((value) => ({ value }))
  const saveNextAction = async (row: JobRow) => {
    if (!editingAction || editingAction.jobId !== row.id) return
    const saved = await onUpdateNextAction(row.id, editingAction.value.trim())
    if (saved) setEditingAction(null)
  }
  const sortTitle = (label: string, field: Exclude<JobsTableSort, null>) => {
    const current = sort === field ? direction : null
    const next = current === null ? 'asc' : current === 'asc' ? 'desc' : null
    const stateLabel = current === 'asc' ? '升序' : current === 'desc' ? '降序' : '未排序'
    return (
      <button
        type="button"
        className="job-sort-heading"
        aria-label={`按${label}排序：${stateLabel}`}
        onClick={() => onSort(next ? field : null, next ?? 'desc')}
      >
        <span>{label}</span>
        <span aria-hidden="true">{current === 'asc' ? '↑' : current === 'desc' ? '↓' : '↕'}</span>
      </button>
    )
  }
  const columns: TableProps<JobRow>['columns'] = [
    {
      title: '公司',
      dataIndex: 'companyName',
      key: 'company',
      width: 150,
      align: 'left',
      onHeaderCell: () => ({ style: { textAlign: 'center' } }),
      onCell: () => ({ style: { textAlign: 'left' } }),
      render: (_name, row) => <Link to={`/companies/${row.companyId}`}>{row.companyName}</Link>,
    },
    {
      title: '岗位',
      dataIndex: 'title',
      key: 'title',
      width: 190,
      align: 'left',
      onHeaderCell: () => ({ style: { textAlign: 'center' } }),
      onCell: () => ({ style: { textAlign: 'left' } }),
      render: (title: string, row) => (
        <button className="job-title-button" onClick={() => onOpen(row.id)}>
          {row.pinned ? '📌 ' : ''}
          {title}
        </button>
      ),
    },
    {
      title: '投递网址',
      dataIndex: 'primaryListingUrl',
      key: 'postingUrl',
      width: 68,
      align: 'center',
      onHeaderCell: () => ({ style: { textAlign: 'center' } }),
      render: (url?: string | null) =>
        url ? (
          <Link
            aria-label="打开投递网页"
            className="job-posting-url"
            to={`/browser?url=${encodeURIComponent(url)}`}
            title="打开投递网页"
          >
            打开
          </Link>
        ) : (
          <span className="job-posting-url-empty">—</span>
        ),
    },
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 70,
      align: 'center',
      render: (city) => city || '—',
    },
    {
      title: sortTitle('优先级', 'priority'),
      dataIndex: 'priority',
      key: 'priority',
      width: 120,
      align: 'center',
      render: (priority: number, row) => (
        <Select
          aria-label={`优先级 ${row.title}`}
          value={priority}
          options={[
            { value: 1, label: '高' },
            { value: 2, label: '普通' },
            { value: 3, label: '低' },
          ]}
          onChange={(value) => void onUpdatePriority(row.id, value as 1 | 2 | 3)}
        />
      ),
    },
    {
      title: '阶段',
      dataIndex: 'stage',
      key: 'stage',
      width: 150,
      align: 'center',
      render: (stage: ApplicationStage, row) => (
        <StageSelect
          id={row.applicationId}
          value={stage}
          onChanged={onStageChanged}
          onSubmitRequested={() => setSubmissionTarget(row)}
        />
      ),
    },
    {
      title: <span className="job-next-action-heading">下一步</span>,
      dataIndex: 'nextAction',
      key: 'nextAction',
      width: 180,
      align: 'left',
      onHeaderCell: () => ({ style: { textAlign: 'center' } }),
      onCell: () => ({ style: { textAlign: 'left' } }),
      render: (action: string | null, row) =>
        editingAction?.jobId === row.id ? (
          <AutoComplete
            autoFocus
            aria-label={`下一步行动 ${row.title}`}
            value={editingAction.value}
            options={suggestions}
            onChange={(value) => setEditingAction({ jobId: row.id, value })}
            onSelect={(value) => {
              setEditingAction({ jobId: row.id, value })
              void onUpdateNextAction(row.id, value).then((saved) => {
                if (saved) setEditingAction(null)
              })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingAction(null)
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveNextAction(row)
              }
            }}
            placeholder="输入下一步并按 Enter 保存"
            style={{ minWidth: 150 }}
          />
        ) : (
          <div className="job-next-action-cell">
            <Button
              className="job-next-action-label"
              type="link"
              aria-label={`编辑下一步 ${row.title}`}
              onClick={() => setEditingAction({ jobId: row.id, value: action ?? '' })}
            >
              {action || '添加下一步'}
            </Button>
            {row.nextActionAt && (
              <Typography.Text className="job-next-action-at" type="secondary">
                {row.nextActionAt.slice(0, 10)}
              </Typography.Text>
            )}
          </div>
        ),
    },
    {
      title: sortTitle('投递日期', 'appliedAt'),
      dataIndex: 'appliedAt',
      key: 'appliedAt',
      width: 120,
      align: 'center',
      render: (date) => date?.slice(0, 10) || '—',
    },
    {
      title: sortTitle('更新时间', 'updatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 120,
      align: 'center',
      render: (date) => date?.slice(0, 10) || '—',
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      align: 'center',
      render: (_value, row) => (
        <>
          <Button type="link" onClick={() => onOpen(row.id)}>
            详情
          </Button>
          <Popconfirm
            title="移到已删除？"
            description="可以在阶段筛选中选择“已删除”后恢复。"
            okText="移到已删除"
            cancelText="取消"
            onConfirm={() => onDelete(row.id)}
          >
            <Button type="link" danger aria-label={`删除岗位：${row.title}`}>
              删除
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ]
  return (
    <>
      <Table<JobRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [...jobsPageSizes],
          showTotal: (count) => `共 ${count} 个岗位`,
        }}
        onChange={(pagination) => {
          if (pagination.current && (pagination.current !== page || pagination.pageSize !== pageSize))
            onPageChange(pagination.current, pagination.pageSize ?? pageSize)
        }}
      />
      {submissionTarget && (
        <SubmissionDialog
          id={submissionTarget.applicationId}
          open
          onOpenChange={(open) => {
            if (!open) setSubmissionTarget(null)
          }}
          showTrigger={false}
          onSubmitted={() => {
            setSubmissionTarget(null)
            onStageChanged()
          }}
        />
      )}
    </>
  )
}
