import { describe, expect, it, vi } from 'vitest'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'

const senderFrame = { url: 'app://jobflow/', isMainFrame: true }

describe('settings IPC', () => {
  it('limits directory access to the configured E-drive path and validates empty requests', async () => {
    const openDirectory = vi.fn(async () => undefined)
    const services = {
      'jobflow:settings.getInfo': async () => ({
        ok: true,
        data: { dataDirectory: 'E:\\JobFlow\\Data', version: '1.2.3' },
      }),
      'jobflow:settings.openDataDirectory': async () => {
        await openDirectory('E:\\JobFlow\\Data')
        return { ok: true, data: undefined }
      },
    }
    const registry = createHandlerRegistry('app://jobflow', services)
    const call = (channel: string, input: unknown) =>
      registry.dispatch(channel, { senderFrame, args: [input] })

    await expect(call('jobflow:settings.getInfo', {})).resolves.toEqual({
      ok: true,
      data: { dataDirectory: 'E:\\JobFlow\\Data', version: '1.2.3' },
    })
    await call('jobflow:settings.openDataDirectory', {})
    expect(openDirectory).toHaveBeenCalledExactlyOnceWith('E:\\JobFlow\\Data')
    await expect(call('jobflow:settings.openDataDirectory', { path: 'C:\\Users\\Public' })).rejects.toThrow(
      /输入内容有误/,
    )
  })

  it('requires an empty explicit request to apply a previously staged restore', async () => {
    const apply = vi.fn(async () => ({ ok: true, data: { applied: true, restartRequired: true } }))
    const registry = createHandlerRegistry('app://jobflow', {
      'jobflow:backup.applyStagedRestoreAndRestart': apply,
    })

    await expect(
      registry.dispatch('jobflow:backup.applyStagedRestoreAndRestart', { senderFrame, args: [{}] }),
    ).resolves.toMatchObject({ ok: true, data: { applied: true } })
    await expect(
      registry.dispatch('jobflow:backup.applyStagedRestoreAndRestart', {
        senderFrame,
        args: [{ confirm: false }],
      }),
    ).rejects.toThrow(/输入内容有误/)
  })
})
