import type { SecretProtector } from '../../src/main/security/protected-value'

export const fakeSecretProtector: SecretProtector = {
  async isAvailable() {
    return true
  },
  async encrypt(plainText) {
    return Buffer.from(`test-only:${plainText}`, 'utf8')
  },
  async decrypt(cipherText) {
    const value = Buffer.from(cipherText).toString('utf8')
    if (!value.startsWith('test-only:')) throw new Error('Invalid test cipher')
    return { plainText: value.slice('test-only:'.length), shouldReEncrypt: false }
  },
}
