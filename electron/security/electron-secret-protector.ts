import { safeStorage } from 'electron'
import type { SecretProtector } from '../../src/main/security/protected-value'

export const electronSecretProtector: SecretProtector = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
  async decrypt(cipherText) {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(cipherText)
    return { plainText: result, shouldReEncrypt }
  },
}
