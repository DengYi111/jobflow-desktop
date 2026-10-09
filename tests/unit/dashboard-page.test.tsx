// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { JobFlowApi } from '../../src/shared/contracts/api'

vi.mock('../../src/renderer/features/jobs/KanbanBoard', () => ({
  KanbanBoard: ({ refreshToken = 0 }: { refreshToken?: number }) => (
    <div data-testid="kanban-board" data-refresh-token={refreshToken} />
  ),
}))

import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage'

afterEach(cleanup)
beforeEach(() => {
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

function createApi() {
  let publish:
    | ((change: { domain: 'jobs' | 'applications' | 'interviews' | 'companies' | 'profile' }) => void)
    | undefined
  const getSummary = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      activeCount: 0,
      upcomingInterviewCount: 1,
      upcomingInterviews: [],
      nextActions: [],
      actionLanes: [
        {
          key: 'TO_APPLY',
          count: 1,
          items: [
            {
              applicationId: 'application-apply',
              stage: 'TO_APPLY',
              jobId: 'job-apply',
              jobTitle: '嵌入式工程师',
              companyName: '星河科技',
              postingUrl: 'https://careers.example.com/jobs/1',
              notificationEnabled: false,
              notificationAt: null,
            },
          ],
        },
        {
          key: 'ASSESSMENT_PENDING',
          count: 1,
          items: [
            {
              applicationId: 'application-assessment',
              stage: 'ASSESSMENT_PENDING',
              jobId: 'job-assessment',
              jobTitle: '软件工程师',
              companyName: '云端系统',
              notificationEnabled: false,
              notificationAt: null,
            },
          ],
        },
        {
          key: 'WRITTEN_TEST_PENDING',
          count: 1,
          items: [
            {
              applicationId: 'application-written',
              stage: 'WRITTEN_TEST_PENDING',
              jobId: 'job-written',
              jobTitle: '固件工程师',
              companyName: '芯片科技',
              notificationEnabled: false,
              notificationAt: null,
            },
          ],
        },
        {
          key: 'INTERVIEW',
          count: 1,
          items: [
            {
              applicationId: 'application-interview',
              interviewId: 'interview-1',
              interviewAt: '2026-10-01T09:00:00.000Z',
              round: '第 1 面',
              roundNumber: 1,
              type: 'TECHNICAL',
              jobId: 'job-interview',
              jobTitle: '嵌入式工程师',
              companyName: '星河科技',
              notificationEnabled: false,
              notificationAt: null,
            },
          ],
        },
        {
          key: 'CUSTOM',
          count: 1,
          items: [
            {
              applicationId: 'application-custom',
              nextAction: '准备项目介绍',
              nextActionAt: null,
              jobId: 'job-custom',
              jobTitle: '系统工程师',
              companyName: '远山科技',
              notificationEnabled: false,
              notificationAt: null,
            },
          ],
        },
      ],
    },
  })
  const setStageNotification = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const setNextActionNotification = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const completeStageAction = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const completeNextAction = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const completeInterview = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const setInterviewType = vi.fn().mockImplementation(async ({ type }: { type: string }) => {
    const summary = getSummary.mock.results[0]?.value
    const state = await summary
    state.data.actionLanes[3].items[0].type = type
    return { ok: true, data: undefined }
  })
  const interviewTransition = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const createInterview = vi.fn().mockResolvedValue({ ok: true, data: { id: 'interview-new' } })
  const setInterviewNotification = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const submit = vi.fn().mockResolvedValue({ ok: true, data: undefined })
  const resumesList = vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'resume-1', name: '嵌入式简历' }] })
  window.jobflow = {
    changes: {
      subscribe: vi.fn((listener) => {
        publish = listener as typeof publish
        return () => {
          publish = undefined
        }
      }),
    },
    dashboard: { getSummary },
    applications: {
      setStageNotification,
      setNextActionNotification,
      completeStageAction,
      completeNextAction,
      submit,
      transition: interviewTransition,
    },
    interviews: {
      create: createInterview,
      complete: completeInterview,
      setType: setInterviewType,
      setNotification: setInterviewNotification,
    },
    resumes: { list: resumesList },
  } as unknown as JobFlowApi
  return {
    getSummary,
    setStageNotification,
    setNextActionNotification,
    completeStageAction,
    completeNextAction,
    completeInterview,
    setInterviewType,
    interviewTransition,
    createInterview,
    setInterviewNotification,
    submit,
    resumesList,
    emitChange: (domain: 'jobs' | 'applications' | 'interviews' | 'companies' | 'profile') =>
      publish?.({ domain }),
  }
}

describe('dashboard page', () => {
  it('reloads the dashboard immediately after a related mutation event', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: '今天，先做好一件事。' })
    expect(api.getSummary).toHaveBeenCalledTimes(1)
    api.emitChange('applications')
    await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2))
  })

  it('shows four counted action lanes and removes the old dashboard summaries', async () => {
    createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '今天，先做好一件事。' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '投递岗位' })).toBeTruthy()
    expect(screen.queryByText('进行中的投递')).toBeNull()
    expect(screen.queryByText('近期面试')).toBeNull()
    expect(screen.queryByRole('heading', { name: '下一步行动' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '待办与提醒' })).toBeNull()

    const laneNames = ['待投递', '待测评', '待笔试', '待面试']
    for (const name of laneNames) expect(screen.getByRole('heading', { name: new RegExp(name) })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '自定义行动' })).toBeNull()
    expect(document.querySelectorAll('.dashboard-action-grid > .dashboard-action-lane')).toHaveLength(4)
    expect(screen.getByTestId('kanban-board')).toBeTruthy()
  })

  it('sends the primary dashboard action to the delivery browser', async () => {
    createApi()
    function CurrentPath() {
      return <output data-testid="current-path">{useLocation().pathname}</output>
    }
    render(
      <MemoryRouter>
        <DashboardPage />
        <CurrentPath />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '投递岗位' }))

    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/browser'))
  })

  it('uses the shared submission form with resume selection and the default channel', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByLabelText('完成投递：星河科技 · 嵌入式工程师'))
    await screen.findByLabelText('投递时间')
    expect(screen.getByLabelText('投递时间')).toBeTruthy()
    expect(document.querySelector('#resumeVersionId')).toBeTruthy()
    expect(document.querySelector('#channel')).toBeTruthy()
    expect(document.querySelector('#notes')).toBeTruthy()
    expect((document.querySelector('#channel') as HTMLInputElement).value).toBe('官网')
    expect(api.resumesList).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '保存投递' }))

    await waitFor(() =>
      expect(api.submit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'application-apply', channel: '官网', appliedAt: expect.any(String) }),
      ),
    )
    await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('kanban-board').getAttribute('data-refresh-token')).toBe('1')
  })

  it('completes assessment, written test and all interview rounds against their own records', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByLabelText('完成：云端系统 · 软件工程师'))
    fireEvent.click(screen.getByLabelText('完成：芯片科技 · 固件工程师'))
    fireEvent.click(screen.getByLabelText('已完成全部面试：星河科技 · 嵌入式工程师'))

    await waitFor(() => {
      expect(api.completeStageAction).toHaveBeenCalledWith({ id: 'application-assessment' })
      expect(api.completeStageAction).toHaveBeenCalledWith({ id: 'application-written' })
      expect(api.completeInterview).toHaveBeenCalledWith({ id: 'interview-1' })
    })
  })

  it('opens a pending job posting in the embedded browser without showing date or notification controls', async () => {
    createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    const lane = await screen.findByTestId('dashboard-action-lane-TO_APPLY')
    const posting = within(lane).getByRole('link', { name: '星河科技 · 嵌入式工程师' })
    expect(posting.getAttribute('href')).toBe('/browser?url=https%3A%2F%2Fcareers.example.com%2Fjobs%2F1')
    expect(within(lane).queryByLabelText(/提醒日期时间/)).toBeNull()
    expect(within(lane).queryByLabelText(/桌面通知/)).toBeNull()
  })

  it('places round editing and interview decisions on the pending-interview action card', async () => {
    createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    const interviewLane = await screen.findByTestId('dashboard-action-lane-INTERVIEW')
    expect(within(interviewLane).getByRole('button', { name: '第一面·技术面' })).toBeTruthy()
    expect(
      within(interviewLane).queryByRole('combobox', { name: '面试类型：星河科技 · 嵌入式工程师' }),
    ).toBeNull()
    expect(within(interviewLane).getByLabelText('下一面：星河科技 · 嵌入式工程师')).toBeTruthy()
    expect(within(interviewLane).getByLabelText('已完成全部面试：星河科技 · 嵌入式工程师')).toBeTruthy()
    expect(within(interviewLane).getByLabelText('已被拒：星河科技 · 嵌入式工程师')).toBeTruthy()
    expect(screen.getByTestId('kanban-board')).toBeTruthy()
  })

  it('updates interview type and schedules the next round from the pending-interview card', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    const lane = await screen.findByTestId('dashboard-action-lane-INTERVIEW')

    fireEvent.click(within(lane).getByRole('button', { name: '第一面·技术面' }))
    fireEvent.mouseDown(within(lane).getByRole('combobox', { name: '面试类型：星河科技 · 嵌入式工程师' }))
    fireEvent.click(await screen.findByText('主管面', { selector: '.ant-select-item-option-content' }))
    await waitFor(() =>
      expect(api.setInterviewType).toHaveBeenCalledWith({ id: 'interview-1', type: 'MANAGER' }),
    )

    fireEvent.click(within(lane).getByLabelText('下一面：星河科技 · 嵌入式工程师'))
    expect(await screen.findByText('安排第 2 面')).toBeTruthy()
  })

  it('completes or rejects the pending interview from its action card', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    const lane = await screen.findByTestId('dashboard-action-lane-INTERVIEW')

    fireEvent.click(within(lane).getByLabelText('已完成全部面试：星河科技 · 嵌入式工程师'))
    await waitFor(() => expect(api.completeInterview).toHaveBeenCalledWith({ id: 'interview-1' }))

    fireEvent.click(within(lane).getByLabelText('已被拒：星河科技 · 嵌入式工程师'))
    expect(await screen.findByText(/岗位将移入“已结束”/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '标记未通过' }))
    await waitFor(() =>
      expect(api.interviewTransition).toHaveBeenCalledWith({
        id: 'application-interview',
        stage: 'CLOSED',
        closeReason: 'REJECTED',
        endOpenInterviews: true,
      }),
    )
  })

  it('saves the interview reminder independently from other interview records', async () => {
    const api = createApi()
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    const label = '星河科技 · 第一面·技术面'
    const timeInput = await screen.findByLabelText(`提醒日期时间：${label}`)
    const reminderRow = timeInput.closest('.dashboard-action-reminder-row')
    expect(reminderRow).toBeTruthy()
    expect(reminderRow?.contains(screen.getByLabelText(`桌面通知：${label}`))).toBe(true)
    fireEvent.change(timeInput, { target: { value: '2026-09-27T10:00' } })
    fireEvent.blur(timeInput)
    fireEvent.click(screen.getByLabelText(`桌面通知：${label}`))

    await waitFor(() =>
      expect(api.setInterviewNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'interview-1',
          enabled: true,
          notificationAt: expect.any(String),
        }),
      ),
    )
  })

  it('moves action jobs into a new lane by the shared application id', async () => {
    const api = createApi()
    const transition = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    window.jobflow.applications.transition = transition
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    const article = (await screen.findByLabelText('完成：云端系统 · 软件工程师')).closest('article')!
    const values = new Map<string, string>()
    const transfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key) ?? '',
    }
    fireEvent.dragStart(article, { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('dashboard-action-lane-TO_APPLY'), { dataTransfer: transfer })

    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith({ id: 'application-assessment', stage: 'TO_APPLY' }),
    )
    expect(api.getSummary).toHaveBeenCalled()
  })

  it('opens the shared interview scheduler when an action is dragged into the interview lane', async () => {
    createApi()
    const createInterview = vi.fn().mockResolvedValue({ ok: true, data: { id: 'interview-new' } })
    window.jobflow.interviews.create = createInterview
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    const article = (await screen.findByLabelText('完成：云端系统 · 软件工程师')).closest('article')!
    const values = new Map<string, string>()
    const transfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key) ?? '',
    }
    fireEvent.dragStart(article, { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId('dashboard-action-lane-INTERVIEW'), { dataTransfer: transfer })
    expect(await screen.findByText('安排第 1 面')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('面试时间'), { target: { value: '2026-10-01T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并进入面试中' }))

    await waitFor(() =>
      expect(createInterview).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 'application-assessment', roundNumber: 1 }),
      ),
    )
  })
})
