import { describe, expect, it, vi } from 'vitest'
import { createSettingsService } from '../../src/main/services/settings.service'

describe('settings service', () => {
  it('returns the fixed data directory and opens only that directory', async () => {
    const openDirectory = vi.fn(async () => {})
    const service = createSettingsService({
      dataDirectory: 'E:\\JobFlow\\Data',
      version: '1.2.3',
      openDirectory,
    })

    expect(service.getInfo()).toEqual({ dataDirectory: 'E:\\JobFlow\\Data', version: '1.2.3' })
    await service.openDataDirectory()

    expect(openDirectory).toHaveBeenCalledExactlyOnceWith('E:\\JobFlow\\Data')
  })
})
