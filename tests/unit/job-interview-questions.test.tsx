// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { JobInterviewQuestions } from '../../src/renderer/features/jobs/JobInterviewQuestions'

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

describe('JobInterviewQuestions', () => {
  it('shows all questions with the interview round they belong to', async () => {
    window.jobflow = {
      interviews: {
        questions: {
          listByApplication: vi.fn().mockResolvedValue({
            ok: true,
            data: [
              {
                id: 'question-1',
                interviewId: 'interview-1',
                question: 'volatile 的作用？',
                category: 'C语言',
                round: '第 1 面',
                roundNumber: 1,
                type: 'TECHNICAL',
                interviewAt: '2026-09-24T10:00:00.000Z',
                myAnswer: '限制编译器优化',
                notes: '补充内存模型',
              },
              {
                id: 'question-2',
                interviewId: 'interview-2',
                question: '为什么选择我们？',
                category: '行为面',
                round: '第 2 面',
                roundNumber: 2,
                type: 'HR',
                interviewAt: '2026-09-25T10:00:00.000Z',
                myAnswer: null,
                notes: null,
              },
            ],
          }),
        },
      },
    } as unknown as JobFlowApi

    render(
      <MemoryRouter>
        <JobInterviewQuestions applicationId="application-1" refreshKey={0} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('volatile 的作用？')).toBeTruthy()
    expect(screen.getByText('第一面 · 技术面')).toBeTruthy()
    expect(screen.getByText(/我的回答：限制编译器优化/)).toBeTruthy()
    expect(screen.getByText('为什么选择我们？')).toBeTruthy()
    expect(screen.getByText('第二面 · HR 面')).toBeTruthy()
  })
})
