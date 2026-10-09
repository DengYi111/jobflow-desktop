// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Modal } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { SettingsPage } from '../../src/renderer/features/settings/SettingsPage'

afterEach(() => {
  cleanup()
  Modal.destroyAll()
})
beforeEach(() => {
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

function installApi() {
  const api = {
    settings: {
      getInfo: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { dataDirectory: 'E:\\JobFlow\\Data', version: '1.2.3' } }),
      openDataDirectory: vi.fn().mockResolvedValue({ ok: true }),
    },
    dashboard: {
      getNotificationsEnabled: vi.fn().mockResolvedValue({ ok: true, data: true }),
      setNotificationsEnabled: vi.fn().mockResolvedValue({ ok: true }),
    },
    backup: {
      exportFromDialog: vi.fn().mockResolvedValue({ ok: true, data: { canceled: false } }),
      restoreFromDialog: vi.fn().mockResolvedValue({ ok: true, data: { canceled: false, staged: true } }),
      exportCsvFromDialog: vi.fn().mockResolvedValue({ ok: true, data: { canceled: false } }),
      applyStagedRestoreAndRestart: vi.fn().mockResolvedValue({ ok: true }),
    },
    browser: {
      clearHistory: vi.fn().mockResolvedValue({ ok: true }),
      clearSession: vi.fn().mockResolvedValue({ ok: true }),
    },
  }
  window.jobflow = api as unknown as JobFlowApi
  return api
}

describe('settings page', () => {
  it('shows Chinese settings sections, the E-drive data directory, and app version', async () => {
    installApi()
    render(<SettingsPage />)

    expect(await screen.findByText('E:\\JobFlow\\Data')).toBeTruthy()
    expect(screen.getByText('数据与备份')).toBeTruthy()
    expect(screen.getByText('提醒与隐私')).toBeTruthy()
    expect(screen.getByText('应用信息')).toBeTruthy()
    expect(screen.getByText('版本 1.2.3')).toBeTruthy()
  })

  it('persists a global notification preference change', async () => {
    const api = installApi()
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('switch', { name: '桌面通知总开关' }))

    await waitFor(() =>
      expect(api.dashboard.setNotificationsEnabled).toHaveBeenCalledWith({ enabled: false }),
    )
  })

  it('requires separate confirmation before clearing browser history and login data', async () => {
    const api = installApi()
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '清空浏览历史' }))
    expect(await screen.findByText(/只会清除招聘网站访问记录/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清空历史' }))
    await waitFor(() => expect(api.browser.clearHistory).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '清除登录状态与缓存' }))
    expect(await screen.findByText(/之后需要重新登录/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除登录状态' }))
    await waitFor(() => expect(api.browser.clearSession).toHaveBeenCalledOnce())
  })

  it('stages a validated restore and only applies it from the restart action', async () => {
    const api = installApi()
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '从备份恢复' }))
    fireEvent.click(await screen.findByRole('button', { name: '选择备份并继续' }))

    await waitFor(() => expect(api.backup.restoreFromDialog).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: /重启并应用恢复/ })).toBeTruthy()
    expect(api.backup.applyStagedRestoreAndRestart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /重启并应用恢复/ }))
    await waitFor(() => expect(api.backup.applyStagedRestoreAndRestart).toHaveBeenCalledOnce())
  })
})
