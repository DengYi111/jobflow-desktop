// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobTable, type JobRow } from '../../src/renderer/features/jobs/JobTable'

vi.mock('../../src/renderer/features/jobs/StageSelect', () => ({
  StageSelect: ({ id }: { id: string }) => <span data-testid={`stage-${id}`} />,
}))

afterEach(cleanup)
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
vi.stubGlobal(
  'matchMedia',
  vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
)

const rows: JobRow[] = [
  {
    id: 'job-1',
    applicationId: 'application-1',
    companyId: 'company-1',
    companyName: '星河科技',
    title: '嵌入式工程师',
    city: '上海',
    stage: 'APPLIED',
    priority: 2,
    pinned: false,
    nextAction: '准备作品集',
    nextActionAt: '2026-10-01T09:00:00.000Z',
    deadline: null,
    appliedAt: null,
    updatedAt: '2026-09-26T00:00:00.000Z',
    primaryListingUrl: 'https://careers.example.com/jobs/embedded?campaign=2026',
  },
  {
    id: 'job-2',
    applicationId: 'application-2',
    companyId: 'company-2',
    companyName: '北辰科技',
    title: '固件工程师',
    city: '杭州',
    stage: 'TO_APPLY',
    priority: 3,
    pinned: false,
    nextAction: '联系 HR',
    nextActionAt: null,
    deadline: null,
    appliedAt: null,
    updatedAt: '2026-09-25T00:00:00.000Z',
  },
]

function renderTable(overrides: Partial<React.ComponentProps<typeof JobTable>> = {}) {
  const onUpdatePriority = vi.fn().mockResolvedValue(undefined)
  const onUpdateNextAction = vi.fn().mockResolvedValue(true)
  const onSort = overrides.onSort ?? vi.fn()
  function StatefulTable() {
    const [sort, setSort] = useState<React.ComponentProps<typeof JobTable>['sort']>(overrides.sort ?? null)
    const [direction, setDirection] = useState<'asc' | 'desc'>(overrides.direction ?? 'desc')
    const handleSort = (
      field: React.ComponentProps<typeof JobTable>['sort'],
      nextDirection: 'asc' | 'desc',
    ) => {
      onSort(field, nextDirection)
      setSort(field)
      setDirection(nextDirection)
    }
    return (
      <JobTable
        rows={rows}
        total={2}
        page={1}
        pageSize={8}
        onPageChange={vi.fn()}
        onOpen={vi.fn()}
        onUpdatePriority={onUpdatePriority}
        onUpdateNextAction={onUpdateNextAction}
        onStageChanged={vi.fn()}
        onDelete={vi.fn()}
        {...overrides}
        sort={sort}
        direction={direction}
        onSort={handleSort}
      />
    )
  }
  const rendered = render(
    <MemoryRouter>
      <StatefulTable />
    </MemoryRouter>,
  )
  return { onUpdatePriority, onUpdateNextAction, onSort, ...rendered }
}

describe('job table quick editing', () => {
  it('places a fixed-width truncated posting link between job and city and opens it in the embedded browser', () => {
    const { container } = renderTable()
    const headers = Array.from(container.querySelectorAll('thead th'))
    expect(headers.slice(0, 4).map((header) => header.textContent?.trim())).toEqual([
      '公司',
      '岗位',
      '投递网址',
      '城市',
    ])
    const link = screen.getByRole('link', { name: '打开投递网页' })
    expect(link.getAttribute('href')).toBe(
      '/browser?url=https%3A%2F%2Fcareers.example.com%2Fjobs%2Fembedded%3Fcampaign%3D2026',
    )
    expect(link.getAttribute('title')).toBe('打开投递网页')
    expect(link.textContent).toBe('打开')
    expect(screen.queryByText('https://careers.example.com/jobs/embedded?campaign=2026')).toBeNull()
    expect(link.className).toContain('job-posting-url')
    expect(screen.getByText('—', { selector: '.job-posting-url-empty' })).toBeTruthy()
  })
  it('updates priority through a dropdown and passes the application ID to the stage editor', async () => {
    const user = userEvent.setup()
    const { onUpdatePriority } = renderTable()
    expect(screen.getByTestId('stage-application-1')).toBeTruthy()
    await user.click(screen.getByRole('combobox', { name: '优先级 嵌入式工程师' }))
    await user.click(await screen.findByText('高', { selector: '.ant-select-item-option-content' }))
    expect(onUpdatePriority).toHaveBeenCalledWith('job-1', 1)
  })

  it('allows a custom next action and provides existing actions as suggestions', async () => {
    const user = userEvent.setup()
    const { onUpdateNextAction } = renderTable()
    await user.click(screen.getByRole('button', { name: '编辑下一步 嵌入式工程师' }))
    const input = screen.getByRole('combobox', { name: '下一步行动 嵌入式工程师' })
    await user.clear(input)
    await user.type(input, '联系导师')
    await user.keyboard('{Enter}')
    expect(onUpdateNextAction).toHaveBeenCalledWith('job-1', '联系导师')
  })

  it('centers table headings while keeping company, role, and next-action data left aligned', () => {
    const { container } = renderTable()
    const widths = Array.from(container.querySelectorAll('.ant-table colgroup col')).map(
      (column) => (column as HTMLTableColElement).style.width,
    )
    expect(widths).toEqual(expect.arrayContaining(['150px', '190px', '68px', '180px']))
    const headers = Array.from(container.querySelectorAll('thead th'))
    expect(headers[0].style.textAlign).toBe('center')
    expect(headers[1].style.textAlign).toBe('center')
    expect(headers[6].style.textAlign).toBe('center')
    const cells = Array.from(container.querySelectorAll('tbody tr[data-row-key="job-1"] td'))
    expect(cells[0].style.textAlign).toBe('left')
    expect(cells[1].style.textAlign).toBe('left')
    expect(cells[6].style.textAlign).toBe('left')
  })

  it('removes deadline and archive controls, keeps only details, and sorts only supported fields', () => {
    const { container } = renderTable()
    const labels = Array.from(container.querySelectorAll('thead th')).map((header) =>
      header.textContent?.trim(),
    )
    expect(labels).not.toContain('截止日期')
    expect(labels).toContain('公司')
    expect(container.querySelectorAll('.job-sort-heading').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByRole('button', { name: /按公司排序/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /按岗位排序/ })).toBeNull()
    expect(screen.getByRole('button', { name: /按优先级排序/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /按投递日期排序/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /按更新时间排序/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '归档' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '详情' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /删除岗位：/ })).toHaveLength(2)
  })

  it('cycles the update time sort through ascending, descending, and unsorted', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    renderTable({ onSort })
    await user.click(screen.getByRole('button', { name: '按更新时间排序：未排序' }))
    expect(onSort).toHaveBeenLastCalledWith('updatedAt', 'asc')
    await user.click(screen.getByRole('button', { name: '按更新时间排序：升序' }))
    expect(onSort).toHaveBeenLastCalledWith('updatedAt', 'desc')
    await user.click(screen.getByRole('button', { name: '按更新时间排序：降序' }))
    expect(onSort).toHaveBeenLastCalledWith(null, 'desc')
  })

  it('shows next action and its time on separate left-aligned lines', () => {
    const { container } = renderTable()
    expect(container.querySelector('.job-next-action-label')?.textContent).toBe('准备作品集')
    expect(container.querySelector('.job-next-action-at')?.textContent).toContain('2026-10-01')
    expect(container.querySelector('.job-next-action-heading')?.textContent).toBe('下一步')
  })
})
