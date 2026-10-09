// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobListingForm } from '../../src/renderer/features/jobs/JobListingForm'

describe('job listing form', () => {
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
    Object.defineProperty(globalThis, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
  })

  it('allows JD text when adding and hides the text editor when editing snapshot metadata', () => {
    const onSubmit = vi.fn()
    const common = { onCancel: () => undefined, onSubmit }
    const { rerender } = render(<JobListingForm open {...common} />)
    expect(screen.getByLabelText('JD 原文快照')).toBeTruthy()
    rerender(
      <JobListingForm
        open
        initial={{
          id: 'listing-1',
          url: 'https://example.com/job',
          source: '招聘官网',
          pageTitle: '嵌入式岗位',
          capturedAt: '2026-09-23T08:00:00.000Z',
          jdText: '已保存的原文',
        }}
        {...common}
      />,
    )
    expect(screen.queryByLabelText('JD 原文快照')).toBeNull()
    expect(screen.getByText('编辑仅更新来源和采集信息，已保存的 JD 原文不会被覆盖。')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
