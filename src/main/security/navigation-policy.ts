export function isTrustedNavigation(candidateUrl: string, expectedOrigin: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const expected = new URL(expectedOrigin)
    return (
      candidate.protocol === expected.protocol &&
      candidate.host === expected.host &&
      candidate.username === '' &&
      candidate.password === ''
    )
  } catch {
    return false
  }
}
