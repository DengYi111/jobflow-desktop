import { describe, expect, it } from 'vitest'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { fakeSecretProtector } from '../helpers/fake-secret-protector'

describe('encrypted file store', () => {
  it('encrypts file bytes and restores them with the same Windows account key', async () => {
    const store = createSecureFileStore(fakeSecretProtector)
    const plain = Buffer.from('private résumé sentinel', 'utf8')

    const encrypted = await store.encrypt(plain)

    expect(encrypted.includes(plain)).toBe(false)
    await expect(store.decrypt(encrypted)).resolves.toEqual(plain)
  })

  it('supports empty files without weakening envelope validation', async () => {
    const store = createSecureFileStore(fakeSecretProtector)
    const encrypted = await store.encrypt(Buffer.alloc(0))

    await expect(store.decrypt(encrypted)).resolves.toEqual(Buffer.alloc(0))
  })

  it('rejects tampering without returning partial plaintext', async () => {
    const store = createSecureFileStore(fakeSecretProtector)
    const encrypted = await store.encrypt(Buffer.from('private PDF bytes'))
    encrypted[encrypted.length - 1] ^= 0xff

    await expect(store.decrypt(encrypted)).rejects.toThrow('简历文件无法解密或已损坏')
  })

  it('rejects unsupported format versions and truncated headers', async () => {
    const store = createSecureFileStore(fakeSecretProtector)

    await expect(store.decrypt(Buffer.from('not a protected resume'))).rejects.toThrow('简历文件格式无效')
    await expect(store.decrypt(Buffer.from('JFR1\x00\x00\x00\x20{}'))).rejects.toThrow('简历文件格式无效')
  })

  it('fails closed when the OS key provider is unavailable', async () => {
    const store = createSecureFileStore({
      ...fakeSecretProtector,
      async isAvailable() {
        return false
      },
    })

    await expect(store.encrypt(Buffer.from('resume'))).rejects.toThrow('系统安全存储不可用')
  })
})
