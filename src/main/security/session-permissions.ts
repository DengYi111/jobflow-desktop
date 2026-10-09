import type { Session } from 'electron'

export type SessionPermissionPolicyTarget = Pick<
  Session,
  'setPermissionRequestHandler' | 'setPermissionCheckHandler'
>

export function installDenyAllPermissionPolicy(target: SessionPermissionPolicyTarget): void {
  target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  target.setPermissionCheckHandler(() => false)
}
