import { describe, expect, it } from 'vitest'
import { getQuestionCategories } from '../../src/renderer/features/interviews/question-categories'

describe('question bank category options', () => {
  it('keeps approved categories and includes distinct stored custom categories', () => {
    expect(getQuestionCategories(['自定义协议', '算法', '自定义协议', '驱动开发'])).toEqual([
      'C语言',
      '数据结构',
      '算法',
      'STM32',
      'FreeRTOS',
      '操作系统',
      '计算机网络',
      'Linux',
      '项目',
      '行为面',
      '其他',
      '驱动开发',
      '自定义协议',
    ])
  })
})
