// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { InterviewsPage } from '../../src/renderer/features/interviews/InterviewsPage'
import { InterviewScheduleDialog } from '../../src/renderer/features/interviews/InterviewScheduleDialog'

const interviewList = vi.fn()
const deletePast = vi.fn()
const interviewUpdate = vi.fn()
const interviewCreate = vi.fn()

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
  window.jobflow = {
    interviews: {
      list: interviewList,
      deletePast,
      update: interviewUpdate,
      create: interviewCreate,
      questionBank: { search: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    },
    jobs: { list: vi.fn().mockResolvedValue({ ok: true, data: { items: [], total: 0 } }) },
  } as unknown as JobFlowApi
  interviewList.mockResolvedValue({ ok: true, data: [] })
  deletePast.mockResolvedValue({ ok: true, data: undefined })
  interviewUpdate.mockResolvedValue({ ok: true, data: undefined })
  interviewCreate.mockResolvedValue({ ok: true, data: { id: 'new-interview' } })
})

describe('interview schedule format', () => {
  it('repairs an unnamed legacy round as the first round without offering old-name preservation', async () => {
    interviewList.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'legacy-1',
          applicationId: 'app-1',
          round: '技术一面',
          roundNumber: null,
          cancelledAt: null,
          completedAt: '2026-09-20T10:00:00.000Z',
          type: 'TECHNICAL',
          interviewAt: '2026-09-20T09:00:00.000Z',
          durationMinutes: null,
          format: null,
          mode: null,
          location: null,
          result: null,
          overallPerformance: null,
          strengths: null,
          gaps: null,
          knowledgeGaps: null,
          nextPrep: null,
          companyId: 'company-1',
          companyName: '星河科技',
          jobId: 'job-1',
          jobTitle: '嵌入式工程师',
        },
      ],
    })
    render(
      <MemoryRouter>
        <InterviewsPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByText('历史面试 1'))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))

    expect(screen.getByRole('combobox', { name: '轮次' })).toBeTruthy()
    expect(screen.queryByText('保留旧轮次名称')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() =>
      expect(interviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'legacy-1', roundNumber: 1 }),
      ),
    )
  })

  it('offers permanent deletion only from history and passes explicit confirmation', async () => {
    interviewList.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'past-1',
          applicationId: 'app-1',
          round: '第 1 面',
          roundNumber: 1,
          cancelledAt: null,
          completedAt: '2026-09-20T10:00:00.000Z',
          type: 'TECHNICAL',
          interviewAt: '2026-09-20T09:00:00.000Z',
          durationMinutes: null,
          format: null,
          mode: null,
          location: null,
          result: null,
          overallPerformance: null,
          strengths: null,
          gaps: null,
          knowledgeGaps: null,
          nextPrep: null,
          companyId: 'company-1',
          companyName: '星河科技',
          jobId: 'job-1',
          jobTitle: '嵌入式工程師',
        },
      ],
    })
    render(
      <MemoryRouter>
        <InterviewsPage />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByText('历史面试 1'))
    fireEvent.click(await screen.findByRole('button', { name: '删除历史面试：第 1 面' }))
    expect(await screen.findByText(/本轮面试、题目、复盘和自动时间线标记都会永久删除/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))
    await waitFor(() => expect(deletePast).toHaveBeenCalledWith({ id: 'past-1', confirm: true }))
  })
  it('offers online and offline choices with only the matching destination field', async () => {
    render(
      <MemoryRouter>
        <InterviewsPage />
      </MemoryRouter>,
    )
    const mode = await screen.findByRole('combobox', { name: '形式' })
    fireEvent.mouseDown(mode)
    fireEvent.click(await screen.findByText('线上', { selector: '.ant-select-item-option-content' }))
    expect(await screen.findByRole('textbox', { name: '会议网址（可选）' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '面试地址' })).toBeNull()
    fireEvent.mouseDown(mode)
    fireEvent.click(await screen.findByText('线下', { selector: '.ant-select-item-option-content' }))
    expect(await screen.findByRole('textbox', { name: '面试地址（可选）' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '会议网址（可选）' })).toBeNull()
  })

  it('does not offer cancel in interview history for a past unfinished appointment', async () => {
    interviewList.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'past-open',
          applicationId: 'app-1',
          round: '第 1 面',
          roundNumber: 1,
          cancelledAt: null,
          completedAt: null,
          type: 'TECHNICAL',
          interviewAt: '2020-01-01T09:00:00.000Z',
          durationMinutes: null,
          format: null,
          mode: null,
          location: null,
          result: null,
          overallPerformance: null,
          strengths: null,
          gaps: null,
          knowledgeGaps: null,
          nextPrep: null,
          companyId: 'company-1',
          companyName: '星河科技',
          jobId: 'job-1',
          jobTitle: '嵌入式工程师',
        },
      ],
    })
    render(
      <MemoryRouter>
        <InterviewsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('历史面试 1'))

    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
  })

  it('shows rejected interviews as ended and lets the user edit them instead of rescheduling', async () => {
    interviewList.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'ended-1',
          applicationId: 'app-1',
          round: '第 1 面',
          roundNumber: 1,
          cancelledAt: null,
          endedAt: '2026-09-21T10:00:00.000Z',
          completedAt: null,
          type: 'TECHNICAL',
          interviewAt: '2020-01-01T09:00:00.000Z',
          durationMinutes: null,
          format: null,
          mode: null,
          location: null,
          result: null,
          overallPerformance: null,
          strengths: null,
          gaps: null,
          knowledgeGaps: null,
          nextPrep: null,
          companyId: 'company-1',
          companyName: '星河科技',
          jobId: 'job-1',
          jobTitle: '嵌入式工程师',
        },
      ],
    })
    render(
      <MemoryRouter>
        <InterviewsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByText('历史面试 1'))

    expect(await screen.findByText('已结束')).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重新安排' })).toBeNull()
  })

  it('lets the user choose the next interview type before creating its schedule', async () => {
    render(
      <InterviewScheduleDialog
        applicationId="app-1"
        open
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        initialRoundNumber={2}
        initialType="TECHNICAL"
      />,
    )

    const type = await screen.findByRole('combobox', { name: '面试类型' })
    fireEvent.mouseDown(type)
    fireEvent.click(await screen.findByText('HR 面', { selector: '.ant-select-item-option-content' }))
    fireEvent.change(screen.getByLabelText('面试时间'), {
      target: { value: '2026-09-29T10:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并进入面试中' }))

    await waitFor(() =>
      expect(interviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 'app-1', roundNumber: 2, type: 'HR' }),
      ),
    )
  })
})
