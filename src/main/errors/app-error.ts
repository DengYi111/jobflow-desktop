export class AppError extends Error {
  readonly cause?: unknown

  constructor(
    readonly code: string,
    readonly userMessage: string,
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(userMessage)
    this.name = 'AppError'
    this.cause = options.cause
  }
}

export function mapErrorForUser(error: unknown): { ok: false; code: string; messageZh: string } {
  if (error instanceof AppError) return { ok: false, code: error.code, messageZh: error.userMessage }
  return { ok: false, code: 'INTERNAL_ERROR', messageZh: '操作失败，请重试' }
}
