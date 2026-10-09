// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewsPage } from '../../src/renderer/features/interviews/InterviewsPage'
import type { JobFlowApi } from '../../src/shared/contracts/api'

const addQuestion = vi.fn()
const interview = {
  id: 'interview-1',
  applicationId: 'app-1',
  round: '技术面',
  type: 'TECHNICAL',
  interviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  durationMinutes: 60,
  format: '线上',
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
}
const jobflow = {
  interviews: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    saveReview: vi.fn(),
    questions: { list: vi.fn(), add: addQuestion, update: vi.fn(), delete: vi.fn() },
    questionBank: { search: vi.fn() },
  },
  jobs: { list: vi.fn() },
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
  jobflow.interviews.list.mockResolvedValue({ ok: true, data: [interview] })
  jobflow.interviews.get.mockResolvedValue({ ok: true, data: interview })
  jobflow.interviews.questions.list.mockResolvedValue({ ok: true, data: [] })
  jobflow.interviews.questionBank.search.mockResolvedValue({ ok: true, data: [] })
  addQuestion.mockResolvedValue({ ok: true, data: { id: 'question-1' } })
  jobflow.jobs.list.mockResolvedValue({ ok: true, data: { items: [], total: 0 } })
  window.jobflow = jobflow as unknown as JobFlowApi
})

describe('one-question-at-a-time entry', () => {
  it('saves a question and leaves the form ready for the next question with its category retained', async () => {
    const user = userEvent.setup()
    render(<InterviewsPage />)
    await user.click(await screen.findByRole('button', { name: '查看复盘' }))

    const question = await screen.findByLabelText('题目')
    await user.type(question, '解释中断向量表')
    await user.type(screen.getByLabelText('分类'), '嵌入式基础')
    await user.click(screen.getByRole('button', { name: '保存并添加下一题' }))

    await waitFor(() =>
      expect(addQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          interviewId: 'interview-1',
          question: '解释中断向量表',
          category: '嵌入式基础',
        }),
      ),
    )
    await screen.findByText('本题已保存，可以继续添加下一题')
    expect((screen.getByLabelText('题目') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('分类') as HTMLInputElement).value).toBe('嵌入式基础')

    await user.type(screen.getByLabelText('题目'), '说明 DMA 工作流程')
    await user.click(screen.getByRole('button', { name: '保存并添加下一题' }))
    await waitFor(() => expect(addQuestion).toHaveBeenCalledTimes(2))
    expect(addQuestion).toHaveBeenLastCalledWith(
      expect.objectContaining({ question: '说明 DMA 工作流程', category: '嵌入式基础' }),
    )
  })

  it('opens a searchable question, renders code, collapses answer sections and saves edits', async () => {
    const user = userEvent.setup()
    const bankQuestion = {
      id: 'question-42',
      interviewId: 'interview-1',
      question: '解释指针遍历链表的过程',
      category: 'C 语言',
      myAnswer: '我的思路\n\n```c\nfor (node = head; node; node = node->next) {\n  visit(node);\n}\n```',
      betterAnswer: '逐个访问节点，直到空指针。',
      notes: '注意空链表。',
      companyName: '星河科技',
      companyId: 'company-1',
      jobTitle: '嵌入式工程师',
      jobId: 'job-1',
      occurrenceCount: 1,
      normalizedQuestion: '解释指针遍历链表的过程',
      round: '第一面',
      occurrences: [],
    }
    jobflow.interviews.questionBank.search.mockResolvedValue({ ok: true, data: [bankQuestion] })
    jobflow.interviews.questions.update.mockResolvedValue({
      ok: true,
      data: { ...bankQuestion, myAnswer: '更新后的答案' },
    })

    render(<InterviewsPage />)
    await user.click(screen.getAllByRole('tab', { name: '面试题库' })[0])
    await user.click(await screen.findByRole('button', { name: /解释指针遍历链表的过程/ }))

    await waitFor(() => expect(document.querySelector('.interview-question-drawer')).toBeTruthy())
    expect(document.querySelector('.interview-question-drawer')?.textContent).toContain('编辑解析')
    expect(screen.getByText('编辑解析')).toBeTruthy()
    expect(screen.getByText('我的思路')).toBeTruthy()
    expect(document.querySelector('pre code')?.textContent).toContain('node->next')
    expect(screen.getByText('更好的答案')).toBeTruthy()
    expect(screen.getByText('逐个访问节点，直到空指针。')).toBeTruthy()
    expect(screen.getByText('备注')).toBeTruthy()
    expect(screen.getByText('注意空链表。')).toBeTruthy()

    await user.click(screen.getByText('编辑解析'))
    const myAnswer = await screen.findByLabelText('我的答案')
    await user.clear(myAnswer)
    await user.type(myAnswer, '更新后的答案')
    expect((myAnswer as HTMLTextAreaElement).value).toBe('更新后的答案')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() =>
      expect(jobflow.interviews.questions.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'question-42', myAnswer: '更新后的答案' }),
      ),
    )
    expect(await screen.findByText('更新后的答案')).toBeTruthy()

    const answerHeader = screen.getByText('我的答案')
    const answerSection = answerHeader.closest('.ant-collapse-item')!
    expect(answerSection.classList.contains('ant-collapse-item-active')).toBe(true)
    await user.click(answerHeader)
    await waitFor(() => expect(answerSection.classList.contains('ant-collapse-item-active')).toBe(false))
  })
})
