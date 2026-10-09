// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { BrowserPage } from '../../src/renderer/features/browser/BrowserPage'

afterEach(cleanup)
beforeEach(() => {
  window.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

describe('browser page privacy controls', () => {
  it('refreshes the saved websites list after a recruitment site is collected', async () => {
    const site = {
      id: 'site-1',
      companyId: null,
      name: '汇川科技招聘官网',
      url: 'https://recruit.inovance.com',
      kind: 'CAREERS' as const,
    }
    const company = { id: 'company-1', name: '汇川技术' }
    const listSites = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [site] })
    const saveSite = vi.fn().mockResolvedValue({ ok: true, data: site })
    const updateCompany = vi.fn().mockRejectedValue(new Error('公司资料保存失败'))
    window.jobflow = {
      browser: {
        subscribe: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            tabs: [
              {
                id: 'tab-1',
                url: site.url,
                title: 'Astra',
                loading: false,
                canGoBack: false,
                canGoForward: false,
                error: null,
              },
            ],
            activeTabId: 'tab-1',
          },
        }),
        setBounds: vi.fn().mockResolvedValue({ ok: true }),
        listSites,
        listHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        saveSite,
      },
      companies: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [company] }),
        update: updateCompany,
      },
    } as unknown as JobFlowApi
    render(
      <MemoryRouter>
        <BrowserPage />
      </MemoryRouter>,
    )

    await screen.findByRole('tab', { name: /Astra/ })
    fireEvent.click(screen.getByRole('button', { name: '收藏当前招聘官网' }))
    const dialog = await screen.findByRole('dialog', { name: '收藏招聘网站' })
    fireEvent.change(within(dialog).getByLabelText('显示名称'), {
      target: { value: site.name },
    })
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: '关联公司' }))
    fireEvent.click(await screen.findByText(company.name, { selector: '.ant-select-item-option-content' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))

    await waitFor(() =>
      expect(saveSite).toHaveBeenCalledWith({
        name: site.name,
        companyId: company.id,
        kind: 'CAREERS',
        url: site.url,
      }),
    )
    expect(await screen.findByRole('button', { name: '已保存网站' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '已保存网站' }))
    expect(await screen.findByText(site.name)).toBeTruthy()
  })

  it('hides Electron native web content while a page-owned dialog is open and restores it after close', async () => {
    const setBounds = vi.fn().mockResolvedValue({ ok: true })
    window.jobflow = {
      browser: {
        subscribe: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            tabs: [
              {
                id: 'tab-1',
                url: 'https://careers.example.com',
                title: '招聘官网',
                loading: false,
                canGoBack: false,
                canGoForward: false,
                error: null,
              },
            ],
            activeTabId: 'tab-1',
          },
        }),
        setBounds,
        listSites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      companies: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    } as unknown as JobFlowApi
    const { container } = render(
      <MemoryRouter>
        <BrowserPage />
      </MemoryRouter>,
    )
    await screen.findByRole('tab', { name: /招聘官网/ })
    const viewport = container.querySelector('.browser-viewport') as HTMLElement
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 610,
      bottom: 420,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    })
    fireEvent.click(screen.getByRole('button', { name: '收藏当前招聘官网' }))
    await screen.findByRole('dialog', { name: '收藏招聘网站' })
    await waitFor(() => expect(setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 0, height: 0 }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(setBounds).toHaveBeenLastCalledWith({ x: 10, y: 20, width: 600, height: 400 }))
  })

  it('keeps history and saved sites collapsed until each section is expanded', async () => {
    window.jobflow = {
      browser: {
        subscribe: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({ ok: true, data: { tabs: [], activeTabId: null } }),
        setBounds: vi.fn().mockResolvedValue({ ok: true }),
        listSites: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              id: 'site-1',
              name: '联影招聘官网',
              url: 'https://jobs.example.com',
              kind: 'CAREERS',
              companyId: null,
            },
          ],
        }),
        listHistory: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              id: 'visit-1',
              url: 'https://jobs.example.com',
              title: '联影岗位列表',
              visitedAt: '2026-09-26T09:00:00.000Z',
            },
          ],
        }),
      },
      companies: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    } as unknown as JobFlowApi
    render(
      <MemoryRouter>
        <BrowserPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: '已保存网站' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '浏览历史记录' })).toBeTruthy()
    expect(screen.queryByText('联影招聘官网')).toBeNull()
    expect(screen.queryByText('联影岗位列表')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '已保存网站' }))
    expect(await screen.findByText('联影招聘官网')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '浏览历史记录' }))
    expect(await screen.findByText('联影岗位列表')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull()
    expect(screen.queryByRole('button', { name: '清除登录状态与缓存' })).toBeNull()
  })

  it('shows browser tools beside the live webpage and fills a focused field from a profile chip', async () => {
    const setBounds = vi.fn().mockResolvedValue({ ok: true })
    const fillFocusedField = vi.fn().mockResolvedValue({ ok: true, data: { filled: true } })
    window.jobflow = {
      browser: {
        subscribe: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            tabs: [
              {
                id: 'tab-1',
                url: 'https://careers.example.com',
                title: '招聘官网',
                loading: false,
                canGoBack: false,
                canGoForward: false,
                error: null,
              },
            ],
            activeTabId: 'tab-1',
          },
        }),
        setBounds,
        listSites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        inspectForm: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listAutofillMappings: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        fillProfileFields: vi.fn().mockResolvedValue({ ok: true, data: { filled: 0 } }),
        fillFocusedField,
      },
      companies: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      profile: {
        get: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            profile: { name: '林同学' },
            education: [{ id: 'education-1', school: '武汉大学' }],
            internships: [{ id: 'internship-1', employer: '星河科技' }],
            projects: [{ id: 'project-1', name: '设备驱动项目' }],
          },
        }),
      },
      resumes: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    } as unknown as JobFlowApi
    const { container } = render(
      <MemoryRouter>
        <BrowserPage />
      </MemoryRouter>,
    )
    await screen.findByRole('tab', { name: /招聘官网/ })
    const viewport = container.querySelector('.browser-viewport') as HTMLElement
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 300,
      y: 20,
      left: 300,
      top: 20,
      right: 900,
      bottom: 420,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    })

    fireEvent.click(screen.getByRole('button', { name: /投递助手/ }))
    const nameChip = await screen.findByRole('button', { name: /^姓\s*名$/ })
    expect(await screen.findByRole('button', { name: '学校 · 教育经历 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '实习单位 · 实习经历 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '项目名称 · 项目经历 1' })).toBeTruthy()
    const fillButton = screen.getByRole('button', { name: /一键填写/ })
    expect(screen.queryByRole('dialog', { name: '手动投递助手' })).toBeNull()
    expect(fillButton.closest('.browser-profile-assistant')).toBeNull()
    fireEvent(window, new Event('resize'))
    await waitFor(() =>
      expect(setBounds).toHaveBeenLastCalledWith({ x: 300, y: 20, width: 600, height: 400 }),
    )
    fireEvent.click(nameChip)
    await waitFor(() => expect(fillFocusedField).toHaveBeenCalledWith({ value: '林同学' }))
  })

  it('offers one job capture entry and keeps website access in the toolbar', async () => {
    window.jobflow = {
      browser: {
        subscribe: vi.fn(() => () => {}),
        getState: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            tabs: [
              {
                id: 'tab-1',
                url: 'https://careers.example.com/jobs/1',
                title: '嵌入式工程师',
                loading: false,
                canGoBack: false,
                canGoForward: false,
                error: null,
              },
            ],
            activeTabId: 'tab-1',
          },
        }),
        setBounds: vi.fn().mockResolvedValue({ ok: true }),
        listSites: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        inspectForm: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        listAutofillMappings: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        fillProfileFields: vi.fn().mockResolvedValue({ ok: true, data: { filled: 0 } }),
        capturePage: vi.fn().mockResolvedValue({
          ok: true,
          data: { title: '嵌入式工程师', url: 'https://careers.example.com/jobs/1', text: '工作地点 武汉' },
        }),
      },
      companies: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      profile: { get: vi.fn().mockResolvedValue({ ok: true, data: { profile: {} } }) },
      resumes: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    } as unknown as JobFlowApi
    const { container } = render(
      <MemoryRouter>
        <BrowserPage />
      </MemoryRouter>,
    )

    const favorite = await screen.findByRole('button', { name: '收藏当前招聘官网' })
    const saved = screen.getByRole('button', { name: '已保存网站' })
    expect(favorite.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /投递助手/ }))
    const assistant = await screen.findByRole('complementary', { name: '投递助手' })
    expect(within(assistant).getAllByRole('button', { name: /收录岗位/ })).toHaveLength(1)
    expect(within(assistant).getByRole('button', { name: /一键填写/ })).toBeTruthy()
    expect(assistant.querySelector('.browser-profile-assistant')).toBeTruthy()

    fireEvent.click(within(assistant).getByRole('button', { name: /收录岗位/ }))
    expect(await screen.findByRole('dialog', { name: '确认收录岗位' })).toBeTruthy()
    expect(screen.getByText('保存后阶段')).toBeTruthy()
    expect(container.querySelector('.browser-toolbar button[aria-label="收藏当前招聘官网"]')).toBeTruthy()
  })
})
