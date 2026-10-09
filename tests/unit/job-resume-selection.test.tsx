// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { JobResumeSelection } from '../../src/renderer/features/jobs/JobResumeSelection'

const list = vi.fn()
const setResumeVersion = vi.fn()

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
    resumes: { list },
    applications: { setResumeVersion },
  } as unknown as JobFlowApi
  list.mockResolvedValue({
    ok: true,
    data: [{ id: '6b730619-9246-40b8-a0f8-65f634b4d09e', name: '嵌入式校招简历' }],
  })
  setResumeVersion.mockResolvedValue({ ok: true, data: undefined })
})

describe('JobResumeSelection', () => {
  it('saves one selected resume against the application and refreshes the job', async () => {
    const onChanged = vi.fn()
    render(
      <MemoryRouter>
        <JobResumeSelection applicationId="application-1" resumeVersionId={null} onChanged={onChanged} />
      </MemoryRouter>,
    )

    const selector = await screen.findByRole('combobox', { name: '本岗位使用的简历版本' })
    fireEvent.mouseDown(selector)
    fireEvent.click(
      await screen.findByText('嵌入式校招简历', { selector: '.ant-select-item-option-content' }),
    )

    await waitFor(() =>
      expect(setResumeVersion).toHaveBeenCalledWith({
        id: 'application-1',
        resumeVersionId: '6b730619-9246-40b8-a0f8-65f634b4d09e',
      }),
    )
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
