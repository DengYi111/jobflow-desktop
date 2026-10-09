import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Empty, Space, Typography, message, Table, Modal } from 'antd'
import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { CompanyDirectorySummary, JobCreateInput, JobsListInput } from '../../../shared/contracts/api'
import { JobFilters, type JobFilterValues } from './JobFilters'
import { JobTable, type JobRow } from './JobTable'
import { JobForm } from './JobForm'
import { DuplicateWarning } from './DuplicateWarning'
import { getJobsPageSize, setJobsPageSize, type JobsPageSize } from './jobs-page-size'
import { useJobFlowChanges } from '../../app/useJobFlowChanges'

const { Title, Text } = Typography
type Company = { id: string; name: string }
type Result<T> = { ok: true; data: T } | { ok: false; messageZh: string }
function data<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function JobsPage() {
  const changeVersion = useJobFlowChanges(['companies', 'jobs', 'applications', 'interviews'])
  const navigate = useNavigate()
  const [filters, setFilters] = useState<JobFilterValues>({})
  const [rows, setRows] = useState<JobRow[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [directoryCompanies, setDirectoryCompanies] = useState<CompanyDirectorySummary[]>([])
  const directorySearchVersion = useRef(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(getJobsPageSize)
  const [sort, setSort] = useState<JobsListInput['sort']>(null)
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingJob, setPendingJob] = useState<JobCreateInput | null>(null)
  const [duplicates, setDuplicates] = useState<JobRow[]>([])
  const [warningOpen, setWarningOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>()
  const [confirmClearTrash, setConfirmClearTrash] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = data(
        await window.jobflow.jobs.list({ filters, sort, direction, page: { page, pageSize } }),
      )
      setRows(result.items as JobRow[])
      setTotal(result.total)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '岗位加载失败')
    } finally {
      setLoading(false)
    }
  }, [direction, filters, messageApi, page, pageSize, sort])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (changeVersion) void load()
  }, [changeVersion, load])
  useEffect(() => {
    void window.jobflow.companies
      .list()
      .then((result) => setCompanies(data(result) as Company[]))
      .catch(() => messageApi.error('公司列表加载失败'))
  }, [messageApi])

  const searchDirectoryCompanies = async (query: string) => {
    const version = ++directorySearchVersion.current
    if (!query.trim()) {
      setDirectoryCompanies([])
      return
    }
    try {
      const result = data(await window.jobflow.companies.listDirectory({ query }))
      if (version === directorySearchVersion.current) setDirectoryCompanies(result.companies)
    } catch (error) {
      if (version === directorySearchVersion.current)
        messageApi.error(error instanceof Error ? error.message : '公司目录搜索失败')
    }
  }

  const importDirectoryCompany = async (directoryId: string): Promise<Company> => {
    const entry = directoryCompanies.find((company) => company.id === directoryId)
    if (entry?.localCompany && !entry.localCompany.archivedAt)
      return { id: entry.localCompany.id, name: entry.localCompany.name }
    const company = data(await window.jobflow.companies.addFromDirectory({ directoryId })) as Company
    setCompanies((current) =>
      current.some((existing) => existing.id === company.id)
        ? current
        : [...current, company].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    )
    return company
  }

  const submit = async (input: JobCreateInput, allowDuplicate = false) => {
    try {
      const duplicatesResult = allowDuplicate
        ? []
        : (data(
            await window.jobflow.jobs.findDuplicates({
              title: input.title,
              companyId: input.companyId,
              url: input.url || undefined,
            }),
          ) as JobRow[])
      if (duplicatesResult.length) {
        setPendingJob(input)
        setDuplicates(duplicatesResult)
        setWarningOpen(true)
        return
      }
      await window.jobflow.jobs.create({ ...input, allowDuplicate })
      setFormOpen(false)
      setWarningOpen(false)
      setPendingJob(null)
      messageApi.success('岗位已保存')
      void load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    }
  }
  const updatePriority = async (jobId: string, priority: 1 | 2 | 3) => {
    try {
      const row = rows.find((item) => item.id === jobId)
      data(await window.jobflow.jobs.update({ id: jobId, priority, expectedUpdatedAt: row?.updatedAt }))
      messageApi.success('优先级已更新')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '优先级更新失败')
    }
  }

  const updateNextAction = async (jobId: string, nextAction: string): Promise<boolean> => {
    const row = rows.find((item) => item.id === jobId)
    if (!row) return false
    try {
      data(
        await window.jobflow.applications.setNextAction({
          id: row.applicationId,
          nextAction: nextAction.trim() || null,
          nextActionAt: row.nextActionAt,
        }),
      )
      messageApi.success('下一步已更新，原计划时间已保留')
      await load()
      return true
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '下一步更新失败')
      return false
    }
  }

  const softDelete = async (id: string) => {
    try {
      data(await window.jobflow.jobs.softDelete({ id }))
      messageApi.success('岗位已移到已删除')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '删除失败')
    }
  }
  const restore = async (id: string) => {
    try {
      data(await window.jobflow.jobs.restore({ id }))
      messageApi.success('岗位已恢复')
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '恢复失败')
    }
  }
  const permanentlyDelete = async () => {
    if (!confirmDeleteId) return
    try {
      data(await window.jobflow.jobs.permanentlyDelete({ id: confirmDeleteId, confirm: true }))
      messageApi.success('岗位及其关联记录已永久删除')
      setConfirmDeleteId(undefined)
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '永久删除失败')
    }
  }
  const clearTrash = async () => {
    try {
      data(await window.jobflow.jobs.clearTrash({ confirm: true }))
      messageApi.success('已清空回收站')
      setConfirmClearTrash(false)
      await load()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '清空回收站失败')
    }
  }
  const trashColumns = [
    { title: '公司', dataIndex: 'companyName', align: 'center' as const },
    { title: '岗位', dataIndex: 'title', align: 'center' as const },
    {
      title: '原阶段',
      dataIndex: 'stage',
      align: 'center' as const,
      render: (stage: JobRow['stage']) => stage,
    },
    {
      title: '操作',
      key: 'actions',
      align: 'center' as const,
      render: (_: unknown, row: JobRow) => (
        <Space>
          <Button type="link" onClick={() => void restore(row.id)}>
            恢复
          </Button>
          <Button type="link" danger onClick={() => setConfirmDeleteId(row.id)}>
            永久删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="page jobs-page">
      {contextHolder}
      <header className="page-heading">
        <div>
          <Text className="eyebrow">求职进度</Text>
          <Title level={2}>岗位管理</Title>
          <Text type="secondary">把公司、岗位信息和下一步行动集中管理。</Text>
        </div>
        <Space>
          <Button icon={<TeamOutlined />} onClick={() => navigate('/companies')}>
            公司管理
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => {
              setDirectoryCompanies([])
              setFormOpen(true)
            }}
          >
            添加岗位
          </Button>
        </Space>
      </header>
      <Card className="jobs-card">
        <div className="jobs-filter-row">
          <JobFilters
            value={filters}
            onChange={(next) => {
              setFilters(next)
              setPage(1)
            }}
            onReset={() => {
              setFilters({})
              setPage(1)
            }}
          />
          {filters.stage === 'DELETED' && (
            <Button danger onClick={() => setConfirmClearTrash(true)}>
              清空已删除
            </Button>
          )}
        </div>
        {rows.length && filters.stage === 'DELETED' ? (
          <Table<JobRow>
            rowKey="id"
            columns={trashColumns}
            dataSource={rows}
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['6', '15', '30', '50'],
              showTotal: (count) => `共 ${count} 个已删除岗位`,
              onChange: (nextPage, nextSize) => {
                setPage(nextSize === pageSize ? nextPage : 1)
                setPageSize(nextSize as JobsPageSize)
                setJobsPageSize(nextSize as JobsPageSize)
              },
            }}
          />
        ) : rows.length ? (
          <JobTable
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort ?? null}
            direction={direction}
            loading={loading}
            onPageChange={(newPage, size) => {
              const nextSize = size as JobsPageSize
              setPage(nextSize === pageSize ? newPage : 1)
              setPageSize(nextSize)
              setJobsPageSize(nextSize)
            }}
            onOpen={(id) => navigate(`/jobs/${id}`)}
            onSort={(nextSort, nextDirection) => {
              setSort(nextSort)
              setDirection(nextDirection)
            }}
            onUpdatePriority={(id, priority) => void updatePriority(id, priority)}
            onUpdateNextAction={updateNextAction}
            onStageChanged={() => void load()}
            onDelete={(id) => void softDelete(id)}
          />
        ) : (
          <Empty
            description={
              loading ? '正在加载岗位…' : filters.stage === 'DELETED' ? '回收站为空' : '还没有岗位记录'
            }
          >
            {filters.stage !== 'DELETED' && (
              <Button type="primary" onClick={() => setFormOpen(true)}>
                添加第一个岗位
              </Button>
            )}
          </Empty>
        )}
      </Card>
      <JobForm
        open={formOpen}
        companies={companies}
        directoryCompanies={directoryCompanies}
        onSearchDirectory={(query) => void searchDirectoryCompanies(query)}
        onImportDirectoryCompany={importDirectoryCompany}
        onCancel={() => setFormOpen(false)}
        onSubmit={(input) => submit(input)}
      />
      <DuplicateWarning
        open={warningOpen}
        matches={duplicates}
        onCancel={() => setWarningOpen(false)}
        onContinue={() => {
          if (pendingJob) void submit(pendingJob, true)
        }}
        onOpen={(id) => {
          setWarningOpen(false)
          navigate(`/jobs/${id}`)
        }}
      />
      <Modal
        title="永久删除岗位"
        open={Boolean(confirmDeleteId)}
        okText="永久删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onOk={() => void permanentlyDelete()}
        onCancel={() => setConfirmDeleteId(undefined)}
      >
        此操作无法撤销。岗位关联的投递时间线、面试和题目也会删除，公司资料及简历文件会保留。
      </Modal>
      <Modal
        title="清空已删除岗位"
        open={confirmClearTrash}
        okText="永久删除全部"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onOk={() => void clearTrash()}
        onCancel={() => setConfirmClearTrash(false)}
      >
        此操作无法撤销，将永久删除回收站中的岗位及其投递关联记录，公司资料及简历文件会保留。
      </Modal>
    </div>
  )
}
