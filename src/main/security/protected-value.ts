const protectedValuePrefix = 'jobflow:protected:'
const versionOnePrefix = `${protectedValuePrefix}v1:`

export interface SecretProtector {
  isAvailable(): Promise<boolean>
  encrypt(plainText: string): Promise<Buffer>
  decrypt(cipherText: Buffer): Promise<{ plainText: string; shouldReEncrypt: boolean }>
}

export interface UnprotectedValue {
  value: string | null
  wasPlaintext: boolean
  shouldReEncrypt: boolean
}

export async function protectValue(
  value: string | null | undefined,
  protector: SecretProtector,
): Promise<string | null> {
  if (value == null) return null
  if (value === '') return ''
  if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用')

  const encrypted = await protector.encrypt(value)
  return `${versionOnePrefix}${encrypted.toString('base64')}`
}

export async function unprotectValue(
  value: string | null | undefined,
  protector: SecretProtector,
): Promise<UnprotectedValue> {
  if (value == null || value === '')
    return { value: value ?? null, wasPlaintext: false, shouldReEncrypt: false }
  if (!value.startsWith(protectedValuePrefix)) return { value, wasPlaintext: true, shouldReEncrypt: false }
  if (!value.startsWith(versionOnePrefix)) throw new Error('加密资料格式不受支持')

  const encoded = value.slice(versionOnePrefix.length)
  const encrypted = Buffer.from(encoded, 'base64')
  if (!encoded || encrypted.toString('base64') !== encoded) throw new Error('加密资料格式无效')
  if (!(await protector.isAvailable())) throw new Error('系统安全存储不可用')

  try {
    const result = await protector.decrypt(encrypted)
    return { value: result.plainText, wasPlaintext: false, shouldReEncrypt: result.shouldReEncrypt }
  } catch (cause) {
    const error = new Error('本机账户无法解锁资料') as Error & { cause?: unknown }
    error.cause = cause
    throw error
  }
}
