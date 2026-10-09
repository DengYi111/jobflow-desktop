// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { JobsPage } from '../../src/renderer/features/jobs/JobsPage'

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

const row = {
  id: 'job-1',
  applicationId: 'application-1',
  companyId: 'company-1',
  companyName: '星河科技',
  title: '嵌入式工程师',
  city: '上海',
  stage: 'APPLIED',
  priority: 2,
  pinned: false,
  nextAction: '准备作品集',
  nextActionAt: '2026-10-01T09:00:00.000Z',
  deadline: null,
  appliedAt: null,
  updatedAt: '2026-09-26T00:00:00.000Z',
}

function mount(setNextAction: ReturnType<typeof vi.fn>, items = [row]) {
  const api = {
    jobs: {
      list: vi.fn().mockResolvedValue({ ok: true, data: { items, total: items.length } }),
      update: vi.fn().mockResolvedValue({ ok: true, data: null }),
    },
    companies: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    applications: { setNextAction },
  }
  window.jobflow = api as unknown as JobFlowApi
  const rendered = render(
    <MemoryRouter initialEntries={['/jobs']}>
      <Routes>
        <Route path="/jobs" element={<JobsPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { api, ...rendered }
}

describe('job page inline updates', () => {
  it('saves a custom next action and preserves the existing planned time', async () => {
    const user = userEvent.setup()
    const setNextAction = vi.fn().mockResolvedValue({ ok: true, data: null })
    mount(setNextAction)
    await user.click(await screen.findByRole('button', { name: '编辑下一步 嵌入式工程师' }))
    const input = await screen.findByRole('combobox', { name: '下一步行动 嵌入式工程师' })
    await user.clear(input)
    await user.type(input, '联系导师')
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(setNextAction).toHaveBeenCalledWith({
        id: 'application-1',
        nextAction: '联系导师',
        nextActionAt: row.nextActionAt,
      }),
    )
  })

  it('keeps the editor open with the typed value when saving fails', async () => {
    const user = userEvent.setup()
    const setNextAction = vi.fn().mockResolvedValue({ ok: false, messageZh: '保存失败' })
    mount(setNextAction)
    await user.click(await screen.findByRole('button', { name: '编辑下一步 嵌入式工程师' }))
    const input = await screen.findByRole('combobox', { name: '下一步行动 嵌入式工程师' })
    await user.clear(input)
    await user.type(input, '联系导师')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByText('保存失败')).toBeTruthy())
    expect((input as HTMLInputElement).value).toBe('联系导师')
  })

  it('updates priority through the jobs API', async () => {
    const user = userEvent.setup()
    const { api } = mount(vi.fn().mockResolvedValue({ ok: true, data: null }))
    await user.click(await screen.findByRole('combobox', { name: '优先级 嵌入式工程师' }))
    await user.click(await screen.findByText('高', { selector: '.ant-select-item-option-content' }))
    await waitFor(() =>
      expect(api.jobs.update).toHaveBeenCalledWith({
        id: 'job-1',
        priority: 1,
        expectedUpdatedAt: row.updatedAt,
      }),
    )
  })

  it('persists the selected page size when the jobs page is remounted', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    const pageRows = Array.from({ length: 7 }, (_, index) => ({
      ...row,
      id: `job-${index}`,
      applicationId: `application-${index}`,
      title: `工程师 ${index}`,
    }))
    const first = mount(vi.fn().mockResolvedValue({ ok: true, data: null }), pageRows)
    expect(await screen.findByText('工程师 0')).toBeTruthy()
    await user.click(
      first.container.querySelector('.ant-pagination-options-size-changer-select') as HTMLElement,
    )
    await user.click(await screen.findByText('15 / page'))
    await waitFor(() => expect(localStorage.getItem('jobflow.jobs.pageSize')).toBe('15'))
    first.unmount()

    const second = mount(vi.fn().mockResolvedValue({ ok: true, data: null }))
    await waitFor(() =>
      expect(second.api.jobs.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: { page: 1, pageSize: 15 } }),
      ),
    )
  })
})
