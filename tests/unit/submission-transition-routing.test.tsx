// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageSelect, SubmissionDialog } from '../../src/renderer/features/jobs/StageSelect'
import { KanbanBoard } from '../../src/renderer/features/jobs/KanbanBoard'
import type { JobFlowApi } from '../../src/shared/contracts/api'

const applicationTransition = vi.fn()
const applicationSubmit = vi.fn()
const jobsList = vi.fn()
const resumesList = vi.fn()
const jobflow = {
  applications: { transition: applicationTransition, submit: applicationSubmit },
  jobs: { list: jobsList },
  resumes: { list: resumesList },
}
beforeEach(() => {
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
  window.matchMedia = vi.mocked(matchMedia)
  vi.clearAllMocks()
  applicationTransition.mockResolvedValue({ ok: true, data: undefined })
  applicationSubmit.mockResolvedValue({ ok: true, data: undefined })
  jobsList.mockResolvedValue({
    ok: true,
    data: {
      total: 1,
      items: [
        {
          id: 'job-1',
          applicationId: 'app-1',
          companyId: 'company-1',
          companyName: '星河科技',
          title: '嵌入式工程师',
          city: '上海',
          stage: 'ASSESSMENT_DONE',
          priority: 2,
          pinned: false,
          nextAction: null,
          nextActionAt: null,
          deadline: null,
          appliedAt: null,
          updatedAt: '2026-09-24T00:00:00.000Z',
        },
      ],
    },
  })
  resumesList.mockResolvedValue({ ok: true, data: [{ id: 'resume-1', name: '嵌入式简历' }] })
  window.jobflow = jobflow as unknown as JobFlowApi
})

async function chooseApplied(label: string) {
  const user = userEvent.setup()
  const select = screen.getByRole('combobox', { name: label })
  await user.click(select)
  await waitFor(() => {
    expect(document.querySelector('.ant-select-dropdown-list')).toBeTruthy()
  })
  const option = Array.from(
    document.querySelectorAll('.ant-select-dropdown-list .ant-select-item-option'),
  ).find((element) => element.textContent?.trim() === '已投递')
  if (!option) throw new Error('Kanban 已投递选项未显示')
  fireEvent.mouseDown(option)
  fireEvent.click(option)
}

describe('submission transition routing', () => {
  it('does not render a duplicate standalone submission button when the stage control owns the action', () => {
    render(<SubmissionDialog id="app-1" open={false} showTrigger={false} onSubmitted={() => undefined} />)
    expect(screen.queryByRole('button', { name: '标记已投递' })).toBeNull()
  })

  it('routes the detail stage selector through the submission dialog callback', async () => {
    const onSubmitRequested = vi.fn()
    render(
      <StageSelect
        id="app-1"
        value="TO_APPLY"
        onChanged={() => undefined}
        onSubmitRequested={onSubmitRequested}
      />,
    )
    await chooseApplied('投递阶段')
    expect(onSubmitRequested).toHaveBeenCalledOnce()
    expect(applicationTransition).not.toHaveBeenCalled()
  })

  it('opens the complete submission dialog when a Kanban card moves to 已投递', async () => {
    render(
      <MemoryRouter>
        <KanbanBoard />
      </MemoryRouter>,
    )
    const title = await screen.findByText('嵌入式工程师')
    expect(title).toBeTruthy()
    const card = screen.getByTestId('kanban-job-job-1')
    const appliedColumn = Array.from(document.querySelectorAll('.kanban-column')).find((column) =>
      column.querySelector('.kanban-column-heading')?.textContent?.includes('已投递'),
    ) as HTMLElement
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'job-1') }
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(appliedColumn, { dataTransfer })
    await waitFor(() =>
      expect(document.querySelector('.ant-modal-wrap')?.getAttribute('style')).not.toContain('display: none'),
    )
    const dialog = document.querySelector('.ant-modal[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('#appliedAt')).toBeTruthy()
    expect(dialog.querySelector('#resumeVersionId')).toBeTruthy()
    expect(dialog.querySelector('#channel')).toBeTruthy()
    expect(dialog.querySelector('#notes')).toBeTruthy()
    expect(applicationTransition).not.toHaveBeenCalled()
  })

  it('refreshes the dashboard after a Kanban submission is saved', async () => {
    const onChanged = vi.fn().mockResolvedValue(true)
    render(
      <MemoryRouter>
        <KanbanBoard onChanged={onChanged} />
      </MemoryRouter>,
    )
    const card = await screen.findByTestId('kanban-job-job-1')
    const appliedColumn = Array.from(document.querySelectorAll('.kanban-column')).find((column) =>
      column.querySelector('.kanban-column-heading')?.textContent?.includes('已投递'),
    ) as HTMLElement
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn((type: string) => (type === 'text/jobflow-id' ? 'job-1' : '')),
    }
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.drop(appliedColumn, { dataTransfer })

    await waitFor(() =>
      expect(document.querySelector('.ant-modal-wrap')?.getAttribute('style')).not.toContain('display: none'),
    )
    const dialog = document.querySelector('.ant-modal[role="dialog"]') as HTMLElement
    expect((dialog.querySelector('#channel') as HTMLInputElement).value).toBe('官网')
    fireEvent.click(screen.getByRole('button', { name: '保存投递' }))

    await waitFor(() =>
      expect(applicationSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'app-1', channel: '官网' }),
      ),
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  })
})
afterEach(cleanup)
