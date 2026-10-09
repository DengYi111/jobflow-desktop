// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuestionAnswerContent } from '../../src/renderer/features/interviews/QuestionAnswerContent'

describe('question answer formatting', () => {
  it('separates plain code lines from surrounding prose', () => {
    const { container, getByText } = render(
      <QuestionAnswerContent
        value={'遍历每个节点并累计结果：\nfor (int i = 0; i < count; ++i) {\n  total += values[i];\n}'}
      />,
    )

    expect(getByText('遍历每个节点并累计结果：')).toBeTruthy()
    expect(container.querySelector('pre code')?.textContent).toBe(
      'for (int i = 0; i < count; ++i) {\n  total += values[i];\n}',
    )
  })
})
