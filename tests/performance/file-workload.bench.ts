import { afterAll, bench, describe } from 'vitest'
import { createSecureFileStore } from '../../src/main/services/secure-file-store'
import { fakeSecretProtector } from '../helpers/fake-secret-protector'

const fileStore = createSecureFileStore(fakeSecretProtector)
const resume = Buffer.alloc(25 * 1024 * 1024, 0x50)
let encrypted: Buffer

afterAll(() => {
  resume.fill(0)
  encrypted?.fill(0)
})

describe('25 MB resume encryption cost', () => {
  bench(
    'encrypts a maximum-sized resume',
    async () => {
      encrypted = await fileStore.encrypt(resume)
    },
    { iterations: 3, time: 500 },
  )

  bench(
    'decrypts a maximum-sized resume',
    async () => {
      const result = await fileStore.decrypt(encrypted)
      if (result.length !== resume.length) throw new Error('decrypted file length changed')
      result.fill(0)
    },
    { iterations: 3, time: 500 },
  )
})
