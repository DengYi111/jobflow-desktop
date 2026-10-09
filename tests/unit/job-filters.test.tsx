// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JobFilters } from '../../src/renderer/features/jobs/JobFilters'

describe('job filters', () => {
  it('keeps the useful filters and hides tag and date filters', () => {
    const onChange = vi.fn()
    const { container } = render(<JobFilters value={{}} onChange={onChange} onReset={() => undefined} />)
    fireEvent.change(screen.getByLabelText('搜索岗位'), { target: { value: '嵌入式' } })
    expect(onChange).toHaveBeenLastCalledWith({ query: '嵌入式' })
    fireEvent.change(screen.getByLabelText('城市筛选'), { target: { value: '上海' } })
    expect(onChange).toHaveBeenLastCalledWith({ city: '上海' })
    expect(screen.getByLabelText('阶段筛选')).toBeTruthy()
    expect(screen.getByLabelText('优先级筛选')).toBeTruthy()
    expect(screen.queryByLabelText('标签筛选')).toBeNull()
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(0)
    expect(screen.queryByLabelText('显示已归档')).toBeNull()
    expect(container.querySelector('.job-filters')).toBeTruthy()
    expect(screen.getByRole('button', { name: /重\s*置/ })).toBeTruthy()
  })
})
