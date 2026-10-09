// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'

vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>()
  return {
    ...antd,
    Select: ({
      'aria-label': label,
      placeholder,
      onChange,
    }: {
      'aria-label'?: string
      placeholder?: string
      onChange?: (value: string) => void
    }) => (
      <button
        type="button"
        aria-label={label ?? placeholder}
        onClick={() => onChange?.(placeholder ? 'REJECTED' : 'CLOSED')}
      >
        {placeholder ?? label}
      </button>
    ),
  }
})

import { StageSelect } from '../../src/renderer/features/jobs/StageSelect'

afterEach(cleanup)

describe('stage select close flow', () => {
  it('closes the end-flow dialog after a successful CLOSED transition', async () => {
    const transition = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    window.jobflow = { applications: { transition } } as unknown as JobFlowApi
    render(
      <StageSelect id="app-1" value="INTERVIEW_PENDING" onChanged={vi.fn()} onSubmitRequested={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '投递阶段' }))
    const dialog = await screen.findByRole('dialog', { name: '结束投递流程' })
    fireEvent.click(screen.getByRole('button', { name: '选择原因' }))
    fireEvent.click(dialog.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLElement)

    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith({
        id: 'app-1',
        stage: 'CLOSED',
        closeReason: 'REJECTED',
        cancelOpenInterviews: true,
      }),
    )
    await waitFor(() => expect(dialog.className).toContain('ant-zoom-leave'))
  })
})
