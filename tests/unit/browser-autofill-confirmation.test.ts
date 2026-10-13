import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { createAutofillConfirmationScript } from '../../electron/browser/page-confirmation'

describe('embedded page autofill confirmation', () => {
  it('shows a page-top confirmation over the site and resolves the user choice', async () => {
    const dom = new JSDOM('<main>招聘页面仍在背景中</main>', { runScripts: 'outside-only' })
    let shadow: ShadowRoot | undefined
    const attachShadow = dom.window.HTMLElement.prototype.attachShadow
    dom.window.HTMLElement.prototype.attachShadow = function (init) {
      shadow = attachShadow.call(this, init)
      return shadow
    }
    const confirmation = dom.window.eval(createAutofillConfirmationScript()) as Promise<boolean>
    const host = dom.window.document.querySelector('[data-jobflow-confirmation]') as HTMLElement
    expect(host).toBeTruthy()
    expect(host.shadowRoot).toBeNull()
    expect(host.style.position).toBe('fixed')
    expect(host.style.inset).toBe('0px')
    expect(shadow?.textContent).toContain('确认中等置信度字段')
    expect(dom.window.document.querySelector('main')?.textContent).toContain('招聘页面仍在背景中')

    shadow?.querySelector<HTMLButtonElement>('[data-choice="confirm"]')?.click()
    await expect(confirmation).resolves.toBe(true)
    expect(dom.window.document.querySelector('[data-jobflow-confirmation]')).toBeNull()
    dom.window.close()
  })

  it('lets the user return to mapping review without filling fields', async () => {
    const dom = new JSDOM('<main></main>', { runScripts: 'outside-only' })
    let shadow: ShadowRoot | undefined
    const attachShadow = dom.window.HTMLElement.prototype.attachShadow
    dom.window.HTMLElement.prototype.attachShadow = function (init) {
      shadow = attachShadow.call(this, init)
      return shadow
    }
    const confirmation = dom.window.eval(createAutofillConfirmationScript()) as Promise<boolean>
    shadow?.querySelector<HTMLButtonElement>('[data-choice="review"]')?.click()
    await expect(confirmation).resolves.toBe(false)
    dom.window.close()
  })
})
