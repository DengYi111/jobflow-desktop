import { describe, expect, it } from 'vitest'
import { createChineseMenuTemplate } from '../../electron/app-menu'

describe('native application menu', () => {
  it('uses Chinese labels for the desktop window menus', () => {
    const template = createChineseMenuTemplate()
    expect(template.map((item) => item.label)).toEqual(['文件', '编辑', '查看', '窗口', '帮助'])
    expect(template[0].submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: '退出 JobFlow', role: 'quit' })]),
    )
  })
})
