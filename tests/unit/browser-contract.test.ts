import { describe, expect, it } from 'vitest'
import {
  browserBoundsSchema,
  browserCaptureJobInputSchema,
  browserFillFieldsSchema,
  browserSiteInputSchema,
} from '../../src/shared/schemas/common'

describe('browser request contracts', () => {
  it('only captures bounded HTTPS job pages and rejects unsafe sources', () => {
    const valid = {
      companyName: '星河科技',
      title: '嵌入式工程师',
      url: 'https://careers.example.org/job/1',
      jdText: '岗位职责',
    }
    expect(browserCaptureJobInputSchema.safeParse(valid).success).toBe(true)
    expect(
      browserCaptureJobInputSchema.safeParse({ ...valid, url: 'http://careers.example.org/job/1' }).success,
    ).toBe(false)
    expect(
      browserCaptureJobInputSchema.safeParse({ ...valid, url: 'https://user:pass@careers.example.org/job/1' })
        .success,
    ).toBe(false)
    expect(browserCaptureJobInputSchema.safeParse({ ...valid, jdText: 'x'.repeat(50001) }).success).toBe(
      false,
    )
  })

  it('bounds embedded view geometry, saved URLs and fill requests', () => {
    expect(browserBoundsSchema.safeParse({ x: 0, y: 0, width: 1280, height: 700 }).success).toBe(true)
    expect(browserBoundsSchema.safeParse({ x: -1, y: 0, width: 1280, height: 700 }).success).toBe(false)
    expect(
      browserSiteInputSchema.safeParse({
        name: '招聘官网',
        url: 'https://jobs.example.org/',
        kind: 'CAREERS',
      }).success,
    ).toBe(true)
    expect(
      browserSiteInputSchema.safeParse({ name: '招聘官网', url: 'javascript:alert(1)', kind: 'CAREERS' })
        .success,
    ).toBe(false)
    expect(
      browserSiteInputSchema.safeParse({ name: '招聘官网', url: 'http://jobs.example.org/', kind: 'CAREERS' })
        .success,
    ).toBe(false)
    expect(
      browserFillFieldsSchema.safeParse({
        fields: Array.from({ length: 61 }, (_, index) => ({ signature: `field-${index}`, value: '姓名' })),
      }).success,
    ).toBe(false)
  })
})
