// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KanbanBoard } from '../../src/renderer/features/jobs/KanbanBoard'
import type { JobFlowApi, JobSummary } from '../../src/shared/contracts/api'

const applicationTransition = vi.fn()
const interviewCreate = vi.fn()
const interviewComplete = vi.fn()
const interviewSetType = vi.fn()
const jobsList = vi.fn()
const resumesList = vi.fn()
const jobflow = {
  applications: { transition: applicationTransition },
  interviews: { create: interviewCreate, complete: interviewComplete, setType: interviewSetType },
  jobs: { list: jobsList },
  resumes: { list: resumesList },
}

function job(
  id: string,
  title: string,
  stage: JobSummary['stage'],
  companyId = 'company-a',
  companyName = '星河科技',
): JobSummary {
  return {
    id,
    applicationId: `app-${id}`,
    companyId,
    companyName,
    title,
    city: '上海',
    stage,
    priority: 2,
    pinned: false,
    nextAction: null,
    nextActionAt: null,
    deadline: null,
    appliedAt: null,
    updatedAt: '2026-09-24T00:00:00.000Z',
  }
}

const jobs = [
  job('job-a1', '固件工程师', 'APPLIED'),
  job('job-a2', '嵌入式软件工程师', 'APPLIED'),
  job('job-b1', '驱动开发工程师', 'APPLIED', 'company-b', '远山科技'),
  {
    ...job('job-a3', '高级固件工程师', 'INTERVIEW_PENDING'),
    currentInterview: {
      id: 'interview-a3',
      roundNumber: 2,
      round: '第 2 面',
      type: 'MANAGER',
      interviewAt: '2026-09-24T09:00:00.000Z',
    },
  },
]

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <KanbanBoard />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function dataTransfer() {
  const store = new Map<string, string>()
  return {
    setData: vi.fn((key: string, value: string) => store.set(key, value)),
    getData: vi.fn((key: string) => store.get(key) ?? ''),
  }
}

async function dragJobTo(jobId: string, stage: string) {
  const source = screen.getByTestId(`kanban-job-${jobId}`)
  const transfer = dataTransfer()
  fireEvent.dragStart(source, { dataTransfer: transfer })
  const target = screen.getByTestId(`kanban-column-${stage}`)
  fireEvent.drop(target, { dataTransfer: transfer })
  return transfer
}

async function chooseAntOption(user: ReturnType<typeof userEvent.setup>, label: string, optionText: string) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await waitFor(() => expect(document.querySelector('.ant-select-dropdown-list')).toBeTruthy())
  const option = Array.from(
    document.querySelectorAll('.ant-select-dropdown-list .ant-select-item-option'),
  ).find((element) => element.textContent?.trim() === optionText)
  if (!option) throw new Error(`找不到选项：${optionText}`)
  fireEvent.mouseDown(option)
  fireEvent.click(option)
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
  interviewCreate.mockResolvedValue({ ok: true, data: { id: 'interview-new' } })
  interviewComplete.mockResolvedValue({ ok: true, data: undefined })
  interviewSetType.mockResolvedValue({ ok: true, data: undefined })
  jobsList.mockResolvedValue({ ok: true, data: { total: jobs.length, items: jobs } })
  resumesList.mockResolvedValue({ ok: true, data: [] })
  window.jobflow = jobflow as unknown as JobFlowApi
})
afterEach(cleanup)

describe('company-grouped Kanban board', () => {
  it('keeps the interview-in-progress kanban column as a plain job listing', async () => {
    renderBoard()
    await screen.findByTestId('kanban-job-job-a3')
    expect(screen.queryByLabelText('面试类型：高级固件工程师')).toBeNull()
    expect(screen.queryByLabelText('下一面：高级固件工程师')).toBeNull()
    expect(screen.queryByLabelText('已完成：高级固件工程师')).toBeNull()
    expect(screen.queryByLabelText('已被拒：高级固件工程师')).toBeNull()
  })
  it('uses clear Chinese labels for offer and closed stages', async () => {
    renderBoard()
    expect(await screen.findByText('录用沟通')).toBeTruthy()
    expect(screen.getByText('已获录用')).toBeTruthy()
    expect(screen.getByText('已结束')).toBeTruthy()
    expect(screen.queryByText('OC', { exact: true })).toBeNull()
  })

  it('uses Chinese names for pre-application stages in card stage selectors', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))
    await chooseAntOption(user, '固件工程师阶段', '待测评')
    expect(applicationTransition).toHaveBeenCalledWith({ id: 'app-job-a1', stage: 'ASSESSMENT_PENDING' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('option', { name: 'ASSESSMENT_PENDING' })).toBeNull()
  })

  it('expands a company group and opens the selected job detail', async () => {
    const user = userEvent.setup()
    renderBoard()

    const company = await screen.findByRole('button', { name: /星河科技（2）/ })
    await user.click(company)
    const title = screen.getByRole('button', { name: '嵌入式软件工程师' })
    expect(screen.getByRole('button', { name: '固件工程师' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '高级固件工程师' })).toBeNull()

    await user.click(title)
    expect(screen.getByTestId('location').textContent).toBe('/jobs/job-a2')
  })

  it('drags only the selected job from an expanded company group', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))

    const transfer = await dragJobTo('job-a2', 'INTERVIEW_PENDING')
    expect(transfer.setData).toHaveBeenCalledWith('text/jobflow-id', 'job-a2')
    expect(await screen.findByText('安排技术面（第 1 面）')).toBeTruthy()
    expect(applicationTransition).not.toHaveBeenCalled()
  })

  it('keeps the job in its source lane and reports an error when a transition fails', async () => {
    applicationTransition.mockResolvedValueOnce({ ok: false, messageZh: '保存失败' })
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))
    await dragJobTo('job-a2', 'OFFER_COMMUNICATION')

    expect(await screen.findByText('保存失败')).toBeTruthy()
    expect(screen.getByTestId('kanban-job-job-a2')).toBeTruthy()
    expect(
      within(screen.getByTestId('kanban-column-OFFER_COMMUNICATION')).queryByTestId('kanban-job-job-a2'),
    ).toBeNull()
  })

  it('cancels a close transition without saving and keeps the job in its source lane', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))

    const firstTransfer = await dragJobTo('job-a1', 'CLOSED')
    expect(firstTransfer.getData).toHaveBeenCalledWith('text/jobflow-id')
    const firstDialog = (await screen.findByText('请选择结束原因。')).closest('.ant-modal') as HTMLElement
    await user.click(within(firstDialog).getByRole('button', { name: /取\s*消/ }))
    expect(applicationTransition).not.toHaveBeenCalled()
    expect(screen.getByTestId('kanban-job-job-a1')).toBeTruthy()
  })

  it('confirms a close transition with only the selected job and chosen reason', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))
    await dragJobTo('job-a1', 'CLOSED')
    const dialog = (await screen.findByText('请选择结束原因。')).closest('.ant-modal') as HTMLElement
    await chooseAntOption(user, '结束原因', '未通过')
    await user.click(within(dialog).getByRole('button', { name: '确 定' }))

    await waitFor(() =>
      expect(applicationTransition).toHaveBeenCalledWith({
        id: 'app-job-a1',
        stage: 'CLOSED',
        closeReason: 'REJECTED',
      }),
    )
    expect(applicationTransition).toHaveBeenCalledTimes(1)
  })

  it('keeps a keyboard-accessible stage selector for each individual job', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: /星河科技（2）/ }))
    await chooseAntOption(user, '固件工程师阶段', '面试中')
    expect(await screen.findByText('安排技术面（第 1 面）')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('面试时间'), { target: { value: '2026-10-01T09:00' } })
    await user.click(screen.getByRole('button', { name: '保存并进入面试中' }))
    await waitFor(() =>
      expect(interviewCreate).toHaveBeenCalledWith({
        applicationId: 'app-job-a1',
        roundNumber: 1,
        interviewAt: new Date('2026-10-01T09:00').toISOString(),
        type: 'TECHNICAL',
      }),
    )
  })
})
