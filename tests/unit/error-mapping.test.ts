import { describe, expect, it } from 'vitest'
import { AppError, mapErrorForUser } from '../../src/main/errors/app-error'

describe('application errors', () => {
  it('keeps stable codes and safe localized messages separate from internal causes', () => {
    const failure = new AppError('DATA_UNAVAILABLE', '岗位保存失败，请重试', {
      cause: new Error('private internal detail'),
    })
    expect(mapErrorForUser(failure)).toEqual({
      ok: false,
      code: 'DATA_UNAVAILABLE',
      messageZh: '岗位保存失败，请重试',
    })
    expect(JSON.stringify(mapErrorForUser(failure))).not.toContain('private internal detail')
  })

  it('maps unknown failures to a retryable generic message', () => {
    expect(mapErrorForUser(new Error('phone 13800138000'))).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      messageZh: '操作失败，请重试',
    })
  })
})
