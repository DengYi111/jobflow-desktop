// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobsPage } from '../../src/renderer/features/jobs/JobsPage'

const baseGetComputedStyle = window.getComputedStyle.bind(window)
describe('jobs page company directory flow', () => {
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

  it('searches aliases and creates the job using the imported local company ID', async () => {
    const user = userEvent.setup()
    const companyEntry = {
      id: 'internet-software-01',
      name: '腾讯控股',
      aliases: ['Tencent', '微信'],
      industryId: 'internet-software',
      industryName: '互联网与软件',
      localCompany: null,
    }
    const api = {
      jobs: {
        list: vi.fn().mockResolvedValue({ ok: true, data: { items: [], total: 0 } }),
        findDuplicates: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'new-job' } }),
      },
      companies: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { industries: [], companies: [companyEntry] } }),
        addFromDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { id: 'local-tencent', name: '腾讯控股' } }),
      },
    }
    Object.defineProperty(window, 'jobflow', { configurable: true, value: api })
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Routes>
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '添加第一个岗位' }))
    const companyInput = screen.getByRole('combobox', { name: '公司' })
    await user.type(companyInput, '微信')
    await waitFor(() => expect(api.companies.listDirectory).toHaveBeenCalledWith({ query: '微信' }))
    await user.click(await screen.findByText('腾讯控股 · 互联网与软件'))
    await user.type(screen.getByLabelText('岗位名称'), '嵌入式工程师')
    await user.click(screen.getByRole('button', { name: '保存岗位' }))
    await waitFor(() =>
      expect(api.companies.addFromDirectory).toHaveBeenCalledWith({ directoryId: 'internet-software-01' }),
    )
    await waitFor(() =>
      expect(api.jobs.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'local-tencent', title: '嵌入式工程师' }),
      ),
    )
  })

  it('shows an already-added company once when searching with a directory alias', async () => {
    const user = userEvent.setup()
    const companyEntry = {
      id: 'internet-software-01',
      name: '腾讯控股',
      aliases: ['Tencent', '微信'],
      industryId: 'internet-software',
      industryName: '互联网与软件',
      localCompany: {
        id: 'local-tencent',
        name: '腾讯控股',
        careersUrl: null,
        website: null,
        industryId: 'internet-software',
        archivedAt: null,
      },
    }
    const api = {
      jobs: {
        list: vi.fn().mockResolvedValue({ ok: true, data: { items: [], total: 0 } }),
        findDuplicates: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'new-job' } }),
      },
      companies: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'local-tencent', name: '腾讯控股' }] }),
        listDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { industries: [], companies: [companyEntry] } }),
        addFromDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { id: 'local-tencent', name: '腾讯控股' } }),
      },
    }
    Object.defineProperty(window, 'jobflow', { configurable: true, value: api })
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Routes>
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '添加第一个岗位' }))
    await user.type(screen.getByRole('combobox', { name: '公司' }), '微信')
    await waitFor(() => expect(api.companies.listDirectory).toHaveBeenCalledWith({ query: '微信' }))
    expect(await screen.findByRole('option', { name: '腾讯控股' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '腾讯控股 · 互联网与软件' })).toBeNull()
    await user.click(screen.getByText('腾讯控股', { exact: true }))
    expect(screen.getAllByText('腾讯控股').length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('岗位名称'), '嵌入式工程师')
    await user.click(screen.getByRole('button', { name: '保存岗位' }))
    expect(screen.queryByText('请选择公司')).toBeNull()
    expect(screen.queryByText('请填写岗位名称')).toBeNull()
    await waitFor(() => expect(api.jobs.findDuplicates).toHaveBeenCalled())
    await waitFor(() =>
      expect(api.jobs.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'local-tencent' })),
    )
    expect(api.companies.addFromDirectory).not.toHaveBeenCalled()
  })

  it('restores an archived directory company before saving a job', async () => {
    const user = userEvent.setup()
    const companyEntry = {
      id: 'internet-software-01',
      name: '腾讯控股',
      aliases: ['Tencent', '微信'],
      industryId: 'internet-software',
      industryName: '互联网与软件',
      localCompany: {
        id: 'local-tencent',
        name: '腾讯控股',
        careersUrl: null,
        website: null,
        industryId: 'internet-software',
        archivedAt: '2026-09-20T10:00:00.000Z',
      },
    }
    const api = {
      jobs: {
        list: vi.fn().mockResolvedValue({ ok: true, data: { items: [], total: 0 } }),
        findDuplicates: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'new-job' } }),
      },
      companies: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { industries: [], companies: [companyEntry] } }),
        addFromDirectory: vi
          .fn()
          .mockResolvedValue({ ok: true, data: { id: 'local-tencent', name: '腾讯控股' } }),
      },
    }
    Object.defineProperty(window, 'jobflow', { configurable: true, value: api })
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Routes>
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '添加第一个岗位' }))
    await user.type(screen.getByRole('combobox', { name: '公司' }), '微信')
    await waitFor(() => expect(api.companies.listDirectory).toHaveBeenCalledWith({ query: '微信' }))
    await user.click(await screen.findByText('腾讯控股 · 互联网与软件（已归档，保存时恢复）'))
    await user.type(screen.getByLabelText('岗位名称'), '嵌入式工程师')
    await user.click(screen.getByRole('button', { name: '保存岗位' }))
    await waitFor(() =>
      expect(api.companies.addFromDirectory).toHaveBeenCalledWith({ directoryId: 'internet-software-01' }),
    )
    await waitFor(() =>
      expect(api.jobs.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'local-tencent', title: '嵌入式工程师' }),
      ),
    )
  })
})
