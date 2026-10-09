import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'
import {
  createFillFocusedFieldScript,
  createFillFormScript,
  createInstallFocusedFieldTrackerScript,
  inspectFormScript,
} from '../../electron/browser/page-forms'
import { createInspectFormScript } from '../../electron/browser/autofill-form-scanner'

describe('browser profile form assistance', () => {
  it('offers only visible editable text fields and fills selected values without submitting', async () => {
    const dom = new JSDOM(
      `<form><label for="full-name">姓名</label><input id="full-name" name="name" autocomplete="name" type="text"><input name="secret" type="password"><input name="hidden" type="hidden"><button type="submit">提交</button><textarea name="note" placeholder="自我介绍"></textarea></form>`,
      { runScripts: 'outside-only' },
    )
    const { document } = dom.window
    for (const control of document.querySelectorAll('input,textarea,select'))
      vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
        x: 1,
        y: 1,
        width: 100,
        height: 20,
        top: 1,
        left: 1,
        right: 101,
        bottom: 21,
        toJSON: () => ({}),
      })
    const submit = vi.fn()
    document.querySelector('form')?.addEventListener('submit', submit)

    const fields = (await dom.window.eval(inspectFormScript)) as Array<{
      index: number
      signature: string
      label: string
    }>
    expect(fields.map((field) => field.label)).toEqual(['姓名', '自我介绍'])
    const name = fields[0]
    const result = (await dom.window.eval(
      createFillFormScript([{ index: name.index, signature: name.signature, value: '林同学' }]),
    )) as { filled: number }

    expect(result.filled).toBe(1)
    expect((document.querySelector('#full-name') as HTMLInputElement).value).toBe('林同学')
    expect(submit).not.toHaveBeenCalled()
    dom.window.close()
  })

  it('keeps repeated experience fields separately addressable for saved mappings', async () => {
    const dom = new JSDOM(
      `<section><h2>教育经历</h2><div><label>学校</label><input name="school" placeholder="请选择学校"></div><div><label>学校</label><input name="school" placeholder="请选择学校"></div></section>`,
      { runScripts: 'outside-only' },
    )
    const { document } = dom.window
    for (const control of document.querySelectorAll('input'))
      vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
        x: 1,
        y: 1,
        width: 100,
        height: 20,
        top: 1,
        left: 1,
        right: 101,
        bottom: 21,
        toJSON: () => ({}),
      })

    const fields = (await dom.window.eval(inspectFormScript)) as Array<{ signature: string; label: string }>

    expect(fields).toHaveLength(2)
    expect(fields[0].signature).not.toBe(fields[1].signature)
    dom.window.close()
  })

  it('adds and fills education, internship and project rows from saved profile counts', async () => {
    const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' })
    const { document } = dom.window
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 1,
      y: 1,
      width: 100,
      height: 20,
      top: 1,
      left: 1,
      right: 101,
      bottom: 21,
      toJSON: () => ({}),
    } as DOMRect)

    const sections = [
      { title: '教育经历', label: '学校', name: 'school', value: '武汉大学' },
      { title: '实习经历', label: '实习单位', name: 'employer', value: '星河科技' },
      { title: '项目经历', label: '项目名称', name: 'projectName', value: '设备驱动项目' },
    ]
    for (const item of sections) {
      const section = document.createElement('section')
      const heading = document.createElement('h2')
      heading.textContent = item.title
      const records = document.createElement('div')
      const addButton = document.createElement('button')
      addButton.type = 'button'
      addButton.textContent = `添加${item.title}`
      Object.defineProperty(addButton, 'innerText', { get: () => addButton.textContent })
      addButton.addEventListener('click', () => {
        const label = document.createElement('label')
        label.textContent = item.label
        const input = document.createElement('input')
        input.name = item.name
        input.placeholder = `请输入${item.label}`
        records.append(label, input)
      })
      section.append(heading, records, addButton)
      document.querySelector('main')?.append(section)
    }

    const fields = (await dom.window.eval(
      createInspectFormScript({ educationCount: 1, internshipCount: 1, projectCount: 1 }),
    )) as Array<{
      index: number
      signature: string
      label: string
    }>
    const report = (await dom.window.eval(
      createFillFormScript(
        fields.map((field, index) => ({
          index: field.index,
          signature: field.signature,
          value: sections[index].value,
        })),
      ),
    )) as { filled: number }

    expect(fields.map((field) => field.label)).toEqual(['学校', '实习单位', '项目名称'])
    expect(report.filled).toBe(3)
    expect([...document.querySelectorAll('input')].map((input) => input.value)).toEqual([
      '武汉大学',
      '星河科技',
      '设备驱动项目',
    ])
    dom.window.close()
  })

  it('fills only the currently focused safe form field without submitting', () => {
    const dom = new JSDOM(
      `<form><input id="name" type="text"><input id="password" type="password"><button type="submit">提交</button></form>`,
      { runScripts: 'outside-only' },
    )
    const { document } = dom.window
    for (const control of document.querySelectorAll('input'))
      vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
        x: 1,
        y: 1,
        width: 100,
        height: 20,
        top: 1,
        left: 1,
        right: 101,
        bottom: 21,
        toJSON: () => ({}),
      })
    const submit = vi.fn()
    document.querySelector('form')?.addEventListener('submit', submit)
    const name = document.querySelector('#name') as HTMLInputElement
    name.focus()

    expect(dom.window.eval(createFillFocusedFieldScript('林同学'))).toEqual({ filled: true })
    expect(name.value).toBe('林同学')
    ;(document.querySelector('#password') as HTMLInputElement).focus()
    expect(dom.window.eval(createFillFocusedFieldScript('不应填写'))).toEqual({ filled: false })
    expect(submit).not.toHaveBeenCalled()
    dom.window.close()
  })

  it('keeps the last safe page field target after focus moves to the application sidebar', () => {
    const dom = new JSDOM(
      `<form><input id="name" type="text"><button id="sidebar" type="button">姓名</button><button type="submit">提交</button></form>`,
      { runScripts: 'outside-only' },
    )
    const { document } = dom.window
    for (const control of document.querySelectorAll('input,button'))
      vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
        x: 1,
        y: 1,
        width: 100,
        height: 20,
        top: 1,
        left: 1,
        right: 101,
        bottom: 21,
        toJSON: () => ({}),
      })
    const submit = vi.fn()
    document.querySelector('form')?.addEventListener('submit', submit)
    dom.window.eval(createInstallFocusedFieldTrackerScript())
    const name = document.querySelector('#name') as HTMLInputElement
    name.focus()
    name.blur()

    expect(dom.window.eval(createFillFocusedFieldScript('林同学'))).toEqual({ filled: true })
    expect(name.value).toBe('林同学')
    expect(submit).not.toHaveBeenCalled()
    dom.window.close()
  })
})
