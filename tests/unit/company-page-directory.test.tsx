// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanyPage } from '../../src/renderer/features/jobs/CompanyPage'

const directoryData = {
  industries: [
    { id: 'internet-software', nameZh: '互联网与软件' },
    { id: 'finance', nameZh: '金融' },
  ],
  companies: [
    {
      id: 'internet-software-01',
      name: '腾讯控股',
      aliases: ['Tencent', '微信'],
      industryId: 'internet-software',
      industryName: '互联网与软件',
      localCompany: null,
    },
  ],
}
const baseGetComputedStyle = window.getComputedStyle.bind(window)

function setup(listDirectory = vi.fn().mockResolvedValue({ ok: true, data: directoryData })) {
  const api = {
    companies: {
      list: vi
        .fn()
        .mockResolvedValue({ ok: true, data: [{ id: 'mine-1', name: '我的公司', industryId: null }] }),
      listDirectory,
      addFromDirectory: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: 'local-tencent', name: '腾讯控股', industryId: 'internet-software' },
      }),
      create: vi.fn().mockResolvedValue({ ok: true, data: { id: 'created' } }),
      update: vi.fn().mockResolvedValue({ ok: true, data: { id: 'mine-1' } }),
      get: vi.fn().mockResolvedValue({ ok: true, data: null }),
      archive: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
    links: { openExternal: vi.fn() },
  }
  Object.defineProperty(window, 'jobflow', { configurable: true, value: api })
  return { user: userEvent.setup(), api }
}

describe('company directory page', () => {
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

  it('browses by industry or alias and adds a catalog company into local records', async () => {
    const { user, api } = setup()
    render(
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompanyPage />} />
          <Route path="/companies/:companyId" element={<div>公司本地档案</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: '常见公司库' }))
    expect(await screen.findByText('腾讯控股')).toBeTruthy()
    const search = screen.getByPlaceholderText('搜索公司名称或别名')
    await user.type(search, '微信')
    await waitFor(() => expect(api.companies.listDirectory).toHaveBeenLastCalledWith({ query: '微信' }))
    await user.click(screen.getByRole('button', { name: '添加到我的公司' }))
    await waitFor(() =>
      expect(api.companies.addFromDirectory).toHaveBeenCalledWith({ directoryId: 'internet-software-01' }),
    )
    expect(await screen.findByText('已添加')).toBeTruthy()
  })

  it('shows industry selection in manual company create and edit', async () => {
    const { user } = setup()
    render(
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '添加公司' }))
    expect((await screen.findAllByText('所属行业')).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('公司名称')).toBeTruthy()
    expect(screen.getByLabelText('招聘官网')).toBeTruthy()
    expect(screen.getByLabelText('公司网站')).toBeTruthy()
    expect(screen.getByLabelText('备注')).toBeTruthy()
  })

  it('filters the directory by industry and opens an existing local record', async () => {
    const linked = {
      ...directoryData.companies[0],
      localCompany: {
        id: 'local-tencent',
        name: '腾讯控股',
        careersUrl: null,
        website: null,
        industryId: 'internet-software',
      },
    }
    const listDirectory = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { ...directoryData, companies: [linked] } })
    const { user, api } = setup(listDirectory)
    render(
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompanyPage />} />
          <Route path="/companies/:companyId" element={<div>公司本地档案</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: '常见公司库' }))
    expect(screen.getByRole('combobox', { name: '按行业筛选' })).toBeTruthy()
    await waitFor(() =>
      expect(api.companies.listDirectory).toHaveBeenCalledWith({ query: undefined, industryId: undefined }),
    )
    await user.click(await screen.findByRole('button', { name: '查看档案' }))
    expect(await screen.findByText('公司本地档案')).toBeTruthy()
  })

  it('shows a Chinese error when the offline directory cannot be loaded', async () => {
    const listDirectory = vi.fn().mockRejectedValue(new Error('公司目录加载失败'))
    const { user } = setup(listDirectory)
    render(
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: '常见公司库' }))
    expect(await screen.findByText('公司目录加载失败')).toBeTruthy()
  })

  it('offers a clear restore action for a company already archived locally', async () => {
    const user = userEvent.setup()
    const archivedDirectory = {
      industries: directoryData.industries,
      companies: [
        {
          ...directoryData.companies[0],
          localCompany: {
            id: 'archived-tencent',
            name: '腾讯控股',
            careersUrl: null,
            website: null,
            industryId: 'internet-software',
            archivedAt: '2026-09-20T00:00:00.000Z',
          },
        },
      ],
    }
    const listDirectory = vi.fn().mockResolvedValue({ ok: true, data: archivedDirectory })
    const { api } = setup(listDirectory)
    render(
      <MemoryRouter initialEntries={['/companies']}>
        <Routes>
          <Route path="/companies" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: '常见公司库' }))
    await user.click(await screen.findByRole('button', { name: '恢复到我的公司' }))
    await waitFor(() =>
      expect(api.companies.addFromDirectory).toHaveBeenCalledWith({ directoryId: 'internet-software-01' }),
    )
  })

  it('offers a direct route back to the jobs list from company details', async () => {
    setup()
    render(
      <MemoryRouter initialEntries={['/companies/company-1']}>
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyPage />} />
          <Route path="/jobs" element={<div>岗位列表页面</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: '返回岗位列表' }))
    expect(await screen.findByText('岗位列表页面')).toBeTruthy()
  })

  it('shows a single company jobs list without an archived jobs section', async () => {
    setup()
    window.jobflow.companies.get = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        id: 'company-1',
        name: '联影医疗',
        industryId: 'medical-device',
        jobs: [
          {
            id: 'legacy-job',
            title: '历史归档岗位',
            city: '武汉',
            stage: 'APPLIED',
            updatedAt: '2026-09-26T00:00:00.000Z',
          },
        ],
      },
    })
    render(
      <MemoryRouter initialEntries={['/companies/company-1']}>
        <Routes>
          <Route path="/companies/:companyId" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('历史归档岗位')).toBeTruthy()
    expect(screen.getByText('公司下的岗位与投递进度。')).toBeTruthy()
    expect(screen.getAllByText('岗位').length).toBeGreaterThan(0)
    expect(screen.queryByText('已归档岗位')).toBeNull()
    expect(screen.queryByText('进行中的岗位')).toBeNull()
  })
})
