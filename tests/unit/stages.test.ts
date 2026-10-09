import { describe, expect, it } from 'vitest'
import { stageLabels, terminalStages } from '../../src/shared/constants/stages'

describe('application stages', () => {
  it('labels all stages in Chinese and marks only offer/closed as terminal', () => {
    expect(Object.values(stageLabels['zh-CN']).every((label) => /[\u3400-\u9fff]/.test(label))).toBe(true)
    expect(terminalStages).toEqual(['OFFER', 'CLOSED'])
  })
})
