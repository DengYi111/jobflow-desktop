import { describe, expect, it } from 'vitest'
import { protectValue, unprotectValue, type SecretProtector } from '../../src/main/security/protected-value'

function createProtector(): SecretProtector {
  return {
    async isAvailable() {
      return true
    },
    async encrypt(value) {
      return Buffer.from(value.split('').reverse().join(''), 'utf8')
    },
    async decrypt(value) {
      return {
        plainText: Buffer.from(value).toString('utf8').split('').reverse().join(''),
        shouldReEncrypt: false,
      }
    },
  }
}

describe('protected profile values', () => {
  it('round-trips a value through a versioned encrypted envelope', async () => {
    const protector = createProtector()

    const encrypted = await protectValue('13800138000', protector)
    const restored = await unprotectValue(encrypted, protector)

    expect(encrypted).toMatch(/^jobflow:protected:v1:/)
    expect(restored).toEqual({ value: '13800138000', wasPlaintext: false, shouldReEncrypt: false })
  })

  it('preserves null and empty values without encrypting them', async () => {
    const protector = createProtector()

    await expect(protectValue(null, protector)).resolves.toBeNull()
    await expect(unprotectValue(null, protector)).resolves.toEqual({
      value: null,
      wasPlaintext: false,
      shouldReEncrypt: false,
    })
    await expect(protectValue('', protector)).resolves.toBe('')
  })

  it('recognizes legacy plaintext so startup migration can convert it once', async () => {
    await expect(unprotectValue('旧手机号', createProtector())).resolves.toEqual({
      value: '旧手机号',
      wasPlaintext: true,
      shouldReEncrypt: false,
    })
  })

  it('rejects an unknown encrypted envelope instead of displaying it as plaintext', async () => {
    await expect(unprotectValue('jobflow:protected:v99:opaque', createProtector())).rejects.toThrow(
      '加密资料格式不受支持',
    )
  })

  it('fails closed when OS encryption is unavailable', async () => {
    const protector = {
      ...createProtector(),
      async isAvailable() {
        return false
      },
    }

    await expect(protectValue('证件号', protector)).rejects.toThrow('系统安全存储不可用')
  })

  it('propagates authentication or account-key failures without returning cipher text', async () => {
    const protector = {
      ...createProtector(),
      async decrypt() {
        throw new Error('DPAPI failure')
      },
    }

    await expect(unprotectValue('jobflow:protected:v1:Y2lwaGVy', protector)).rejects.toThrow(
      '本机账户无法解锁资料',
    )
  })
})
