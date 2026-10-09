// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Route, Routes } from 'react-router-dom'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { JobForm } from '../../src/renderer/features/jobs/JobForm'
import { JobTable, type JobRow } from '../../src/renderer/features/jobs/JobTable'
import { JobDetailsPage } from '../../src/renderer/features/jobs/JobDetailsPage'

vi.mock('../../src/renderer/features/jobs/ApplicationTimeline', () => ({
  ApplicationTimeline: () => null,
  ReminderForm: () => null,
}))
vi.mock('../../src/renderer/features/jobs/StageSelect', () => ({
  NextActionForm: () => null,
  StageSelect: () => null,
  SubmissionDialog: () => null,
}))

afterEach(cleanup)

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
vi.stubGlobal(
  'matchMedia',
  vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
)

describe('job tag interface', () => {
  it('hides tag entry from the create form while retaining submitted job fields', () => {
    render(
      <JobForm
        open
        companies={[]}
        directoryCompanies={[]}
        onSearchDirectory={vi.fn()}
        onImportDirectoryCompany={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('标签')).toBeNull()
    expect(screen.queryByLabelText('截止日期')).toBeNull()
    expect(screen.getByLabelText('岗位名称')).toBeTruthy()
  })

  it('does not render stored tags in the job table', () => {
    const row: JobRow = {
      id: 'job-1',
      applicationId: 'application-1',
      companyId: 'company-1',
      companyName: '星河科技',
      title: '嵌入式工程师',
      city: null,
      stage: 'TO_APPLY',
      priority: 2,
      pinned: false,
      nextAction: null,
      nextActionAt: null,
      deadline: null,
      appliedAt: null,
      updatedAt: '2026-09-26T00:00:00.000Z',
    }
    render(
      <MemoryRouter>
        <JobTable
          rows={[row]}
          total={1}
          page={1}
          pageSize={6}
          sort="updatedAt"
          direction="desc"
          onPageChange={vi.fn()}
          onOpen={vi.fn()}
          onArchive={vi.fn()}
          onSort={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.queryByText('标签')).toBeNull()
    expect(screen.queryByText('校招')).toBeNull()
    expect(screen.queryByText('嵌入式')).toBeNull()
  })

  it('hides stored tags in the job detail page', async () => {
    const api = {
      jobs: {
        get: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            id: 'job-1',
            companyId: 'company-1',
            company: { name: '星河科技' },
            title: '嵌入式工程师',
            application: { id: 'app-1', currentStage: 'TO_APPLY', priority: 2, pinned: false },
            listings: [],
            tags: [{ id: 'tag-1', name: '校招' }],
            events: [],
          },
        }),
      },
      companies: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'company-1', name: '星河科技' }] }),
      },
    }
    window.jobflow = api as unknown as JobFlowApi
    render(
      <MemoryRouter initialEntries={['/jobs/job-1']}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: '嵌入式工程师' })).toBeTruthy()
    expect(screen.queryByText('校招')).toBeNull()
    expect(screen.queryByLabelText('标签')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '流程' }))
    expect(await screen.findByText('下一步')).toBeTruthy()
    expect(screen.queryByText('添加待办提醒')).toBeNull()
    expect(screen.queryByLabelText('截止日期')).toBeNull()
  })
})
