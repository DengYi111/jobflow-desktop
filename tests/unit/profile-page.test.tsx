// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobFlowApi } from '../../src/shared/contracts/api'
import { ProfilePage } from '../../src/renderer/features/profile/ProfilePage'

afterEach(cleanup)
beforeEach(() => {
  window.ResizeObserver = class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

const education = {
  id: 'education-1',
  school: '武汉大学',
  degree: '硕士',
  major: '计算机',
  startDate: '2020-09',
  endDate: '2023-06',
  notes: null,
  sortOrder: 0,
}
const project = {
  id: 'project-1',
  name: '求职助手',
  role: '开发者',
  startDate: '2022-01',
  endDate: '2022-12',
  description: '项目描述',
  sortOrder: 0,
}
const internship = {
  id: 'internship-1',
  employer: '星河科技',
  role: '软件实习生',
  startDate: '2025-06',
  endDate: '2025-09',
  description: '实习内容',
  sortOrder: 0,
}
const resumes = [1, 2, 3, 4].map((index) => ({
  id: `resume-${index}`,
  name: `简历 ${index}`,
  originalName: `resume-${index}.pdf`,
  relativePath: `resumes/resume-${index}.pdf`,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
}))

function installApi(
  options: {
    education?: (typeof education)[]
    internships?: (typeof internship)[]
    projects?: (typeof project)[]
    customFields?: Array<{ id: string; fieldKey: string; label: string; value: string | null }>
    addEducation?: ReturnType<typeof vi.fn>
  } = {},
) {
  const api = {
    profile: {
      get: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          profile: null,
          education: options.education ?? [],
          internships: options.internships ?? [],
          projects: options.projects ?? [],
          customFields: options.customFields ?? [],
        },
      }),
      save: vi.fn(),
      education: {
        add: options.addEducation ?? vi.fn().mockResolvedValue({ ok: true, data: education }),
        update: vi.fn().mockResolvedValue({ ok: true, data: education }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      internships: {
        add: vi.fn().mockResolvedValue({ ok: true, data: internship }),
        update: vi.fn().mockResolvedValue({ ok: true, data: internship }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      projects: {
        add: vi.fn().mockResolvedValue({ ok: true, data: project }),
        update: vi.fn().mockResolvedValue({ ok: true, data: project }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      },
      customFields: { save: vi.fn(), delete: vi.fn() },
    },
    resumes: {
      list: vi.fn().mockResolvedValue({ ok: true, data: resumes }),
      importFromDialog: vi.fn(),
      archive: vi.fn(),
    },
  }
  window.jobflow = api as unknown as JobFlowApi
  return api
}

describe('profile page experience forms and resume list', () => {
  it('collects common identity, ethnicity, emergency contact, and mailing address fields', async () => {
    installApi()
    render(<ProfilePage />)
    expect(await screen.findByRole('combobox', { name: '证件类型' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '民族' })).toBeTruthy()
    for (const label of ['证件号码', '紧急联系人', '紧急联系人电话', '通讯地址'])
      expect(screen.getByRole('textbox', { name: label })).toBeTruthy()
  })

  it('places resumes first and keeps education and project forms collapsed until requested', async () => {
    installApi()
    render(<ProfilePage />)

    const resumeHeading = await screen.findByText('简历版本', { exact: true })
    const basicHeading = screen.getByText('基本资料', { exact: true })
    expect(
      resumeHeading.compareDocumentPosition(basicHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('从电脑导入', { exact: true })).toBeTruthy()
    expect(screen.getByText('添加教育经历', { exact: true })).toBeTruthy()
    expect(screen.getByText('添加项目经历', { exact: true })).toBeTruthy()
    expect(screen.getByText('添加实习经历', { exact: true })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '学校' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '项目名称' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '实习单位' })).toBeNull()

    const resumeCard = resumeHeading.closest('.ant-card') as HTMLElement
    expect(resumeCard.querySelector('.resume-version-scroll')).toBeTruthy()
    expect(within(resumeCard).getByText('简历 4')).toBeTruthy()

    fireEvent.click(screen.getByText('添加教育经历', { exact: true }))
    expect(await screen.findByRole('textbox', { name: '学校' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '项目名称' })).toBeNull()
    fireEvent.click(screen.getByText('添加项目经历', { exact: true }))
    expect(await screen.findByPlaceholderText('项目名称')).toBeTruthy()
  })

  it('expands the internship editor only when requested and saves structured fields', async () => {
    const api = installApi()
    render(<ProfilePage />)
    fireEvent.click(await screen.findByText('添加实习经历', { exact: true }))
    fireEvent.change(await screen.findByRole('textbox', { name: '实习单位' }), {
      target: { value: '星河科技' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '实习职位' }), { target: { value: '软件实习生' } })
    fireEvent.click(screen.getByRole('button', { name: '保存实习经历' }))
    await waitFor(() =>
      expect(api.profile.internships.add).toHaveBeenCalledWith(
        expect.objectContaining({ employer: '星河科技', role: '软件实习生' }),
      ),
    )
  })

  it('shows custom profile values as compact secondary text and keeps resume files actionable', async () => {
    installApi({
      customFields: [
        { id: 'field-1', fieldKey: 'portfolio', label: '作品集', value: 'https://example.test/portfolio' },
      ],
    })
    render(<ProfilePage />)
    expect(await screen.findByText('作品集：https://example.test/portfolio')).toBeTruthy()
    expect(
      screen.getByText('作品集：https://example.test/portfolio').classList.contains('custom-field-value'),
    ).toBe(true)
    expect(screen.getByRole('button', { name: '打开简历所在加密文件夹：简历 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '预览简历：简历 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '添加自定义资料字段' })).toBeTruthy()
  })

  it('opens and prefills an existing education record, then collapses after a successful save', async () => {
    const api = installApi({ education: [education] })
    render(<ProfilePage />)

    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const schoolInput = (await screen.findByRole('textbox', { name: '学校' })) as HTMLInputElement
    expect(schoolInput.value).toBe('武汉大学')
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() =>
      expect(api.profile.education.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: education.id, school: '武汉大学' }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '学校' })).toBeNull())
  })

  it('keeps the education form open with entered values when saving fails', async () => {
    const addEducation = vi.fn().mockResolvedValue({ ok: false, messageZh: '保存失败' })
    const api = installApi({ addEducation })
    render(<ProfilePage />)

    fireEvent.click(await screen.findByText('添加教育经历', { exact: true }))
    const schoolInput = (await screen.findByRole('textbox', { name: '学校' })) as HTMLInputElement
    fireEvent.change(schoolInput, { target: { value: '华中科技大学' } })
    fireEvent.click(screen.getByRole('button', { name: '保存教育经历' }))

    await waitFor(() => expect(addEducation).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: '学校' }) as HTMLInputElement).value).toBe('华中科技大学')
    expect(api.profile.get).toHaveBeenCalledTimes(1)
  })
})
