// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateWarning } from '../../src/renderer/features/jobs/DuplicateWarning'

describe('duplicate warning', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: false,
        media,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })
  it('offers a direct action to open an existing matching job', () => {
    const onOpen = vi.fn()
    render(
      <DuplicateWarning
        open
        matches={[
          {
            id: 'job-1',
            companyId: 'company-1',
            companyName: '星河科技',
            title: '嵌入式工程师',
            city: '杭州',
            stage: 'TO_APPLY',
            priority: 1,
            pinned: false,
            nextAction: null,
            nextActionAt: null,
            deadline: null,
            appliedAt: null,
            updatedAt: '2026-09-23T00:00:00.000Z',
          },
        ]}
        onCancel={() => undefined}
        onContinue={() => undefined}
        onOpen={onOpen}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开已有岗位' }))
    expect(onOpen).toHaveBeenCalledWith('job-1')
  })
})
