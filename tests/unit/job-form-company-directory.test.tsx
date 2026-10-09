// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobForm } from '../../src/renderer/features/jobs/JobForm'

const directoryCompanies = [
  {
    id: 'internet-software-01',
    name: '腾讯控股',
    aliases: ['Tencent', '微信'],
    industryId: 'internet-software',
    industryName: '互联网与软件',
    localCompany: null,
  },
]
const baseGetComputedStyle = window.getComputedStyle.bind(window)

describe('job form company directory selection', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'getComputedStyle', {
      configurable: true,
      value: (element: Element) => baseGetComputedStyle(element),
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
  })
  afterEach(() => cleanup())

  it('searches aliases and imports the selected company before submitting the job', async () => {
    const user = userEvent.setup()
    const onSearchDirectory = vi.fn()
    const onImportDirectoryCompany = vi.fn().mockResolvedValue({ id: 'local-tencent', name: '腾讯控股' })
    const onSubmit = vi.fn()
    render(
      <JobForm
        open
        companies={[]}
        directoryCompanies={directoryCompanies}
        onSearchDirectory={onSearchDirectory}
        onImportDirectoryCompany={onImportDirectoryCompany}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    const companyInput = screen.getByRole('combobox', { name: '公司' })
    await user.type(companyInput, '微信')
    await waitFor(() => expect(onSearchDirectory).toHaveBeenLastCalledWith('微信'))
    await user.click(await screen.findByText('腾讯控股 · 互联网与软件'))
    await user.type(screen.getByLabelText('岗位名称'), '后端工程师')
    await user.click(screen.getByRole('button', { name: '保存岗位' }))
    await waitFor(() => expect(onImportDirectoryCompany).toHaveBeenCalledWith('internet-software-01'))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'local-tencent', title: '后端工程师' }),
      ),
    )
  })

  it('does not submit a job when importing its directory company fails', async () => {
    const user = userEvent.setup()
    const onImportDirectoryCompany = vi.fn().mockRejectedValue(new Error('公司匹配存在冲突'))
    const onSubmit = vi.fn()
    render(
      <JobForm
        open
        companies={[]}
        directoryCompanies={directoryCompanies}
        onSearchDirectory={vi.fn()}
        onImportDirectoryCompany={onImportDirectoryCompany}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: '公司' }))
    await user.click(await screen.findByText('腾讯控股 · 互联网与软件'))
    await user.type(screen.getByLabelText('岗位名称'), '后端工程师')
    await user.click(screen.getByRole('button', { name: '保存岗位' }))
    await waitFor(() => expect(onImportDirectoryCompany).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findByText('公司匹配存在冲突')).toBeTruthy()
  })
})
