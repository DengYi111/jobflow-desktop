import { describe, expect, it } from 'vitest'
import { isTrustedNavigation } from '../../src/main/security/navigation-policy'
import {
  installDenyAllPermissionPolicy,
  type SessionPermissionPolicyTarget,
} from '../../src/main/security/session-permissions'

describe('renderer navigation policy', () => {
  it('allows only the exact configured protocol and host', () => {
    expect(isTrustedNavigation('app://jobflow/jobs', 'app://jobflow')).toBe(true)
    expect(isTrustedNavigation('http://localhost:5173/jobs', 'http://localhost:5173')).toBe(true)
    expect(isTrustedNavigation('http://localhost:51730/jobs', 'http://localhost:5173')).toBe(false)
    expect(isTrustedNavigation('https://localhost:5173/jobs', 'http://localhost:5173')).toBe(false)
    expect(isTrustedNavigation('http://user@localhost:5173/jobs', 'http://localhost:5173')).toBe(false)
    expect(isTrustedNavigation('https://example.com', 'http://localhost:5173')).toBe(false)
  })

  it('fails closed on malformed URLs', () => {
    expect(isTrustedNavigation('http://[broken', 'http://localhost:5173')).toBe(false)
  })
})

describe('renderer permission policy', () => {
  it('denies both permission requests and permission checks', () => {
    let requestHandler:
      ((_contents: unknown, _permission: string, callback: (allowed: boolean) => void) => void) | undefined
    let checkHandler: (() => boolean) | undefined
    const target = {
      setPermissionRequestHandler: (handler) => {
        requestHandler = handler
      },
      setPermissionCheckHandler: (handler) => {
        checkHandler = handler
      },
    } as unknown as SessionPermissionPolicyTarget
    installDenyAllPermissionPolicy(target)

    let requestAllowed: boolean | undefined
    requestHandler?.({}, 'camera', (allowed) => {
      requestAllowed = allowed
    })
    expect(requestAllowed).toBe(false)
    expect(checkHandler?.()).toBe(false)
  })
})
