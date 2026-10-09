import { describe, expect, it } from 'vitest'
import { createHandlerRegistry } from '../../src/main/ipc/register-handlers'
import { createLinksService } from '../../src/main/services/links.service'

describe('IPC trust boundary', () => {
  it('rejects untrusted senders before invoking any handler', async () => {
    const registry = createHandlerRegistry('http://localhost:5173', {})
    await expect(
      registry.dispatch('jobflow:jobs.list', { senderFrame: { url: 'https://example.com' }, args: [] }),
    ).rejects.toThrow('Untrusted IPC sender')
  })

  it('rejects unknown IPC methods', async () => {
    const registry = createHandlerRegistry('http://localhost:5173', {})
    await expect(
      registry.dispatch('jobflow:filesystem.read', {
        senderFrame: { url: 'http://localhost:5173/' },
        args: [],
      }),
    ).rejects.toThrow('Unknown IPC method')
  })

  it('rejects invalid stages and application event types at the IPC boundary', async () => {
    const registry = createHandlerRegistry('http://localhost:5173', {})
    const request = (args: unknown[]) => ({
      senderFrame: { url: 'http://localhost:5173/', isMainFrame: true },
      args,
    })

    await expect(
      registry.dispatch(
        'jobflow:applications.transition',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', stage: 'GARBAGE' }]),
      ),
    ).rejects.toThrow()
    await expect(
      registry.dispatch(
        'jobflow:applications.transition',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', stage: 'CLOSED' }]),
      ),
    ).rejects.toThrow('结束流程时必须填写结束原因')
    await expect(
      registry.dispatch(
        'jobflow:applications.transition',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', stage: 'CLOSED', closeReason: 'REJECTED' }]),
      ),
    ).resolves.toMatchObject({ code: 'NOT_IMPLEMENTED' })
    await expect(
      registry.dispatch(
        'jobflow:applications.transition',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', stage: 'APPLIED', event: 'GARBAGE' }]),
      ),
    ).rejects.toThrow()
    await expect(
      registry.dispatch(
        'jobflow:applications.addEvent',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', title: '测试', type: 'GARBAGE' }]),
      ),
    ).rejects.toThrow()
    await expect(
      registry.dispatch(
        'jobflow:applications.addEvent',
        request([{ id: '4787a46f-8a65-48eb-a66b-15c5b1e713e6', title: '测试', stage: 'GARBAGE' }]),
      ),
    ).rejects.toThrow()
  })

  it('registers explicit company and reminder methods', async () => {
    const registry = createHandlerRegistry('http://localhost:5173', {})
    const request = { senderFrame: { url: 'http://localhost:5173/', isMainFrame: true }, args: [] }

    await expect(registry.dispatch('jobflow:companies.list', request)).resolves.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
    await expect(registry.dispatch('jobflow:reminders.listDue', request)).resolves.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
  })

  it('validates interview edit and delete methods through the typed IPC allowlist', async () => {
    const registry = createHandlerRegistry('app://jobflow', {})
    const request = (args: unknown[]) => ({ senderFrame: { url: 'app://jobflow/', isMainFrame: true }, args })
    const id = '4787a46f-8a65-48eb-a66b-15c5b1e713e6'
    await expect(
      registry.dispatch(
        'jobflow:interviews.update',
        request([
          {
            id,
            roundNumber: 2,
            interviewAt: '2026-10-01T09:30:00.000Z',
            type: 'TECHNICAL',
            durationMinutes: 60,
            format: '线上',
          },
        ]),
      ),
    ).resolves.toMatchObject({ code: 'NOT_IMPLEMENTED' })
    await expect(registry.dispatch('jobflow:interviews.delete', request([{ id }]))).resolves.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
    await expect(
      registry.dispatch('jobflow:interviews.delete', request([{ id, filePath: 'C:\\private.pdf' }])),
    ).rejects.toThrow()
  })

  it('opens only safe HTTP(S) URLs through the dedicated external-link IPC method', async () => {
    const opened: string[] = []
    const links = createLinksService(async (url) => {
      opened.push(url)
    })
    const registry = createHandlerRegistry('app://jobflow', {
      'jobflow:links.openExternal': async ([input]) => {
        await links.openExternal((input as { url: string }).url)
        return { ok: true }
      },
    })
    const request = (url: string) =>
      registry.dispatch('jobflow:links.openExternal', {
        senderFrame: { url: 'app://jobflow/', isMainFrame: true },
        args: [{ url }],
      })
    await request('https://example.com/jobs')
    expect(opened).toEqual(['https://example.com/jobs'])
    await expect(request('javascript:alert(1)')).rejects.toThrow()
    await expect(request('file:///windows/system.ini')).rejects.toThrow()
    await expect(request('data:text/html,hello')).rejects.toThrow()
    await expect(request('https://user:password@example.com')).rejects.toThrow()
    expect(opened).toEqual(['https://example.com/jobs'])
  })
})
