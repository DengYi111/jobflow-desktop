import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '../../src/main/security/content-security-policy'

describe('content security policy', () => {
  it('allows local Vite connections only in development', () => {
    const productionPolicy = buildContentSecurityPolicy(false)
    const developmentPolicy = buildContentSecurityPolicy(true)

    expect(productionPolicy).toContain("connect-src 'self'")
    expect(productionPolicy).not.toContain('localhost')
    expect(developmentPolicy).toContain("connect-src 'self' http://localhost:* ws://localhost:*")
    expect(developmentPolicy).toContain("script-src 'self'")
  })
})
