import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SecretProtector } from '../security/protected-value'

const fileMagic = Buffer.from('JFR1', 'ascii')
const headerLimit = 8192

interface FileHeader {
  version: 1
  iv: string
  wrappedKey: string
  authTag: string
}

export interface SecureFileStore {
  encrypt(value: Buffer): Promise<Buffer>
  decrypt(value: Buffer): Promise<Buffer>
}

function decodeBase64(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64')
  if (!value || decoded.toString('base64') !== value) throw new Error('简历文件格式无效')
  return decoded
}

function headerAssociatedData(header: Pick<FileHeader, 'version' | 'iv' | 'wrappedKey'>): Buffer {
  return Buffer.from(
    JSON.stringify({ version: header.version, iv: header.iv, wrappedKey: header.wrappedKey }),
    'utf8',
  )
}

function parseEnvelope(envelope: Buffer): { header: FileHeader; ciphertext: Buffer } {
  if (envelope.length < fileMagic.length + 4 || !envelope.subarray(0, fileMagic.length).equals(fileMagic))
    throw new Error('简历文件格式无效')
  const headerLength = envelope.readUInt32BE(fileMagic.length)
  const headerStart = fileMagic.length + 4
  const ciphertextStart = headerStart + headerLength
  if (!headerLength || headerLength > headerLimit || ciphertextStart > envelope.length)
    throw new Error('简历文件格式无效')

  let header: FileHeader
  try {
    header = JSON.parse(envelope.subarray(headerStart, ciphertextStart).toString('utf8')) as FileHeader
  } catch {
    throw new Error('简历文件格式无效')
  }
  if (
    header.version !== 1 ||
    typeof header.iv !== 'string' ||
    typeof header.wrappedKey !== 'string' ||
    typeof header.authTag !== 'string'
  )
    throw new Error('简历文件格式无效')
  return { header, ciphertext: envelope.subarray(ciphertextStart) }
}

export function createSecureFileStore(protector: SecretProtector) {
  return {
    async encrypt(plainText: Buffer): Promise<Buffer> {
      if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用')
      const key = randomBytes(32)
      const iv = randomBytes(12)
      const wrappedKey = (await protector.encrypt(key.toString('base64'))).toString('base64')
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const partialHeader = { version: 1 as const, iv: iv.toString('base64'), wrappedKey }
      cipher.setAAD(headerAssociatedData(partialHeader))
      const ciphertext = Buffer.concat([cipher.update(plainText), cipher.final()])
      const header: FileHeader = { ...partialHeader, authTag: cipher.getAuthTag().toString('base64') }
      const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
      if (headerBytes.length > headerLimit) throw new Error('简历文件头超出大小限制')
      const length = Buffer.alloc(4)
      length.writeUInt32BE(headerBytes.length)
      return Buffer.concat([fileMagic, length, headerBytes, ciphertext])
    },
    async decrypt(envelope: Buffer): Promise<Buffer> {
      const { header, ciphertext } = parseEnvelope(envelope)
      if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用')
      const iv = decodeBase64(header.iv)
      const wrappedKey = decodeBase64(header.wrappedKey)
      const authTag = decodeBase64(header.authTag)
      if (iv.length !== 12 || authTag.length !== 16) throw new Error('简历文件格式无效')

      try {
        const { plainText: keyText } = await protector.decrypt(wrappedKey)
        const key = decodeBase64(keyText)
        if (key.length !== 32) throw new Error('简历文件密钥无效')
        const decipher = createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAAD(headerAssociatedData(header))
        decipher.setAuthTag(authTag)
        return Buffer.concat([decipher.update(ciphertext), decipher.final()])
      } catch (cause) {
        const error = new Error('简历文件无法解密或已损坏') as Error & { cause?: unknown }
        error.cause = cause
        throw error
      }
    },
  }
}
