import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { documentTypes, ethnicities } from '../../../shared/constants/profile-fields'
import { useAutosave } from '../../shared/useAutosave'

const { Title, Text } = Typography
type Education = {
  id: string
  school: string
  degree: string | null
  major: string | null
  startDate: string | null
  endDate: string | null
  notes: string | null
  sortOrder: number
}
type Internship = {
  id: string
  employer: string
  role: string | null
  startDate: string | null
  endDate: string | null
  description: string | null
  sortOrder: number
}
type Project = {
  id: string
  name: string
  role: string | null
  startDate: string | null
  endDate: string | null
  description: string | null
  sortOrder: number
}
type CustomField = { id: string; fieldKey: string; label: string; value: string | null }
type Resume = {
  id: string
  name: string
  originalName: string
  relativePath: string
  notes: string | null
  createdAt: string
}
type ProfileData = {
  profile: Record<string, string | null> | null
  education: Education[]
  internships: Internship[]
  projects: Project[]
  customFields: CustomField[]
}

function unwrap<T>(result: { ok: boolean; data?: T; messageZh?: string }): T {
  if (!result.ok) throw new Error(result.messageZh ?? '操作失败')
  return result.data as T
}

export function ProfilePage() {
  const [data, setData] = useState<ProfileData>({
    profile: null,
    education: [],
    internships: [],
    projects: [],
    customFields: [],
  })
  const [resumes, setResumes] = useState<Resume[]>([])
  const [editingEducation, setEditingEducation] = useState<Education | null>(null)
  const [editingInternship, setEditingInternship] = useState<Internship | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [educationFormOpen, setEducationFormOpen] = useState(false)
  const [internshipFormOpen, setInternshipFormOpen] = useState(false)
  const [projectFormOpen, setProjectFormOpen] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [fieldModalOpen, setFieldModalOpen] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [messageApi, context] = message.useMessage()
  const [profileForm] = Form.useForm()
  const [educationForm] = Form.useForm()
  const [internshipForm] = Form.useForm()
  const [projectForm] = Form.useForm()
  const [fieldForm] = Form.useForm()
  const profileValues = Form.useWatch([], profileForm) as Record<string, string | null> | undefined
  const profileDraft = JSON.stringify(profileValues ?? {})
  const saveProfileDraft = useCallback(async (serialized: string) => {
    unwrap(await window.jobflow.profile.save(JSON.parse(serialized) as Record<string, string | null>))
  }, [])
  const profileAutosave = useAutosave({
    value: profileDraft,
    save: saveProfileDraft,
    revision: profileReady ? 'loaded' : 'loading',
    enabled: profileReady,
    delayMs: 700,
  })

  const reload = useCallback(async () => {
    try {
      setProfileReady(false)
      const profile = unwrap(await window.jobflow.profile.get()) as ProfileData
      setData(profile)
      profileForm.setFieldsValue(profile.profile ?? {})
      setProfileReady(true)
      setResumes(unwrap(await window.jobflow.resumes.list()) as Resume[])
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }, [messageApi, profileForm])
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const syncResumes = async () => {
      try {
        const next = unwrap(await window.jobflow.resumes.list()) as Resume[]
        setResumes((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
      } catch (error) {
        messageApi.error((error as Error).message)
      }
    }
    const timer = window.setInterval(() => {
      void syncResumes()
    }, 2500)
    return () => window.clearInterval(timer)
  }, [messageApi])

  async function saveEducation(values: Omit<Education, 'id'>) {
    try {
      if (editingEducation)
        unwrap(await window.jobflow.profile.education.update({ ...values, id: editingEducation.id }))
      else unwrap(await window.jobflow.profile.education.add(values))
      educationForm.resetFields()
      setEditingEducation(null)
      setEducationFormOpen(false)
      await reload()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function saveProject(values: Omit<Project, 'id'>) {
    try {
      if (editingProject)
        unwrap(await window.jobflow.profile.projects.update({ ...values, id: editingProject.id }))
      else unwrap(await window.jobflow.profile.projects.add(values))
      projectForm.resetFields()
      setEditingProject(null)
      setProjectFormOpen(false)
      await reload()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function saveField(values: { fieldKey: string; label: string; value?: string | null }) {
    try {
      unwrap(await window.jobflow.profile.customFields.save(values))
      fieldForm.resetFields()
      setEditingField(null)
      setFieldModalOpen(false)
      await reload()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function saveInternship(values: Omit<Internship, 'id'>) {
    try {
      if (editingInternship)
        unwrap(await window.jobflow.profile.internships.update({ ...values, id: editingInternship.id }))
      else unwrap(await window.jobflow.profile.internships.add(values))
      internshipForm.resetFields()
      setEditingInternship(null)
      setInternshipFormOpen(false)
      await reload()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function openResume(item: Resume) {
    try {
      unwrap(await window.jobflow.resumes.open({ id: item.id }))
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function showResumeFolder(item: Resume) {
    try {
      unwrap(await window.jobflow.resumes.showInFolder({ id: item.id }))
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  async function importResume() {
    try {
      const imported = unwrap(await window.jobflow.resumes.importFromDialog())
      if (imported) messageApi.success('简历已复制到 JobFlow 本地资料目录')
      await reload()
    } catch (error) {
      messageApi.error((error as Error).message)
    }
  }
  return (
    <div className="page">
      {context}
      <Text className="eyebrow">个人资料库</Text>
      <Title level={2}>个人资料与简历</Title>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Card
          title="简历版本"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void importResume()}>
              从电脑导入
            </Button>
          }
        >
          <Text className="resume-drop-hint" type="secondary">
            也可将 PDF 或 Word 简历放入简历目录，版本列表会自动更新；文件保存在本机 JobFlow 数据目录。
          </Text>
          <div className="resume-version-scroll">
            <List
              dataSource={resumes}
              locale={{ emptyText: '导入 PDF 或 Word 简历，或将文件放入简历目录。' }}
              renderItem={(item) => (
                <List.Item key={item.id}>
                  <List.Item.Meta
                    title={
                      <Button
                        className="resume-open-button"
                        type="link"
                        aria-label={`预览简历：${item.name}`}
                        onClick={() => void openResume(item)}
                      >
                        {item.name}
                      </Button>
                    }
                    description={
                      <Space size="small" wrap>
                        <Text type="secondary">
                          {item.originalName} · 导入于 {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                        </Text>
                        <Button
                          type="link"
                          className="resume-location-button"
                          aria-label={`打开简历文件位置：${item.name}`}
                          onClick={() => void showResumeFolder(item)}
                        >
                          打开文件位置
                        </Button>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        </Card>
        <Card title="基本资料">
          <Form form={profileForm} layout="vertical">
            <Row gutter={16}>
              {(
                [
                  ['name', '姓名'],
                  ['phone', '手机号'],
                  ['email', '邮箱'],
                  ['gender', '性别'],
                  ['birthday', '出生日期'],
                  ['hometown', '家乡'],
                  ['currentCity', '当前城市'],
                  ['expectedCity', '期望城市'],
                  ['expectedSalary', '期望薪资'],
                ] as const
              ).map(([key, label]) => (
                <Col xs={24} md={8} key={key}>
                  <Form.Item name={key} label={label}>
                    <Input allowClear />
                  </Form.Item>
                </Col>
              ))}
              <Col xs={24} md={8}>
                <Form.Item name="documentType" label="证件类型">
                  <Select
                    allowClear
                    showSearch
                    options={documentTypes.map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="documentNumber" label="证件号码">
                  <Input allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="ethnicity" label="民族">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={ethnicities.map((value) => ({ value, label: value }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="emergencyContactName" label="紧急联系人">
                  <Input allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="emergencyContactPhone" label="紧急联系人电话">
                  <Input allowClear />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="mailingAddress" label="通讯地址">
                  <Input allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Space>
              <Text type={profileAutosave.status === 'error' ? 'danger' : 'secondary'} role="status">
                {profileAutosave.status === 'saving'
                  ? '资料正在保存…'
                  : profileAutosave.status === 'saved'
                    ? '个人资料已自动保存'
                    : profileAutosave.status === 'dirty'
                      ? '个人资料有未保存修改'
                      : profileAutosave.status === 'error'
                        ? `保存失败：${profileAutosave.error ?? '请重试'}`
                        : '个人资料自动保存已开启'}
              </Text>
              {profileAutosave.status === 'error' && (
                <Button type="link" onClick={() => void profileAutosave.retry()}>
                  重试
                </Button>
              )}
            </Space>
          </Form>
        </Card>
        <Card
          title="教育经历"
          extra={
            <Space>
              <Text type="secondary">按排序值从小到大展示</Text>
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  educationForm.resetFields()
                  setEditingEducation(null)
                  setEducationFormOpen(true)
                }}
              >
                添加教育经历
              </Button>
            </Space>
          }
        >
          <List
            dataSource={data.education}
            locale={{ emptyText: '添加你的教育经历。' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="link"
                    onClick={() => {
                      setEditingEducation(item)
                      educationForm.setFieldsValue(item)
                      setEducationFormOpen(true)
                    }}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    danger
                    onClick={async () => {
                      unwrap(await window.jobflow.profile.education.delete({ id: item.id }))
                      await reload()
                    }}
                  >
                    删除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${item.school}${item.major ? ` · ${item.major}` : ''}`}
                  description={`${item.degree ?? '学历待补充'} · ${item.startDate ?? '起始日期待补充'} 至 ${item.endDate ?? '至今'} · 排序 ${item.sortOrder}`}
                />
              </List.Item>
            )}
          />
          {educationFormOpen && (
            <Form
              form={educationForm}
              layout="vertical"
              onFinish={saveEducation}
              className="profile-entry-form compact-form"
            >
              <div className="profile-entry-grid">
                <Form.Item name="school" label="学校" rules={[{ required: true }]}>
                  <Input placeholder="学校" />
                </Form.Item>
                <Form.Item name="degree" label="学历">
                  <Input placeholder="学历" />
                </Form.Item>
                <Form.Item name="major" label="专业">
                  <Input placeholder="专业" />
                </Form.Item>
                <Form.Item name="startDate" label="开始日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="endDate" label="结束日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="sortOrder" label="排序" initialValue={0}>
                  <InputNumber min={0} className="full-width" />
                </Form.Item>
                <Form.Item className="profile-entry-actions">
                  <Space>
                    <Button type="primary" htmlType="submit">
                      {editingEducation ? '保存修改' : '保存教育经历'}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingEducation(null)
                        educationForm.resetFields()
                        setEducationFormOpen(false)
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Form.Item>
              </div>
            </Form>
          )}
        </Card>
        <Card
          title="实习经历"
          extra={
            <Space>
              <Text type="secondary">按排序值从小到大展示</Text>
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  internshipForm.resetFields()
                  setEditingInternship(null)
                  setInternshipFormOpen(true)
                }}
              >
                添加实习经历
              </Button>
            </Space>
          }
        >
          <List
            dataSource={data.internships}
            locale={{ emptyText: '添加你的实习经历。' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="link"
                    onClick={() => {
                      setEditingInternship(item)
                      internshipForm.setFieldsValue(item)
                      setInternshipFormOpen(true)
                    }}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    danger
                    onClick={async () => {
                      unwrap(await window.jobflow.profile.internships.delete({ id: item.id }))
                      await reload()
                    }}
                  >
                    删除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${item.employer}${item.role ? ` · ${item.role}` : ''}`}
                  description={`${item.startDate ?? '开始日期待补充'} 至 ${item.endDate ?? '至今'} · 排序 ${item.sortOrder}`}
                />
                {item.description}
              </List.Item>
            )}
          />
          {internshipFormOpen && (
            <Form
              form={internshipForm}
              layout="vertical"
              onFinish={saveInternship}
              className="profile-entry-form compact-form"
            >
              <div className="profile-entry-grid">
                <Form.Item name="employer" label="实习单位" rules={[{ required: true }]}>
                  <Input placeholder="公司或组织" />
                </Form.Item>
                <Form.Item name="role" label="实习职位">
                  <Input placeholder="担任职位" />
                </Form.Item>
                <Form.Item name="sortOrder" label="排序" initialValue={0}>
                  <InputNumber min={0} className="full-width" />
                </Form.Item>
                <Form.Item name="startDate" label="开始日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="endDate" label="结束日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="description" label="工作内容" className="profile-entry-wide">
                  <Input.TextArea rows={3} placeholder="主要职责、行动和结果" />
                </Form.Item>
                <Form.Item className="profile-entry-actions">
                  <Space>
                    <Button type="primary" htmlType="submit">
                      {editingInternship ? '保存修改' : '保存实习经历'}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingInternship(null)
                        internshipForm.resetFields()
                        setInternshipFormOpen(false)
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Form.Item>
              </div>
            </Form>
          )}
        </Card>
        <Card
          title="项目经历"
          extra={
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                projectForm.resetFields()
                setEditingProject(null)
                setProjectFormOpen(true)
              }}
            >
              添加项目经历
            </Button>
          }
        >
          <List
            dataSource={data.projects}
            locale={{ emptyText: '添加项目经历，后续可用于简历和面试准备。' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="link"
                    onClick={() => {
                      setEditingProject(item)
                      projectForm.setFieldsValue(item)
                      setProjectFormOpen(true)
                    }}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    danger
                    onClick={async () => {
                      unwrap(await window.jobflow.profile.projects.delete({ id: item.id }))
                      await reload()
                    }}
                  >
                    删除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${item.name}${item.role ? ` · ${item.role}` : ''}`}
                  description={`${item.startDate ?? '开始日期待补充'} 至 ${item.endDate ?? '至今'} · 排序 ${item.sortOrder}`}
                />
                {item.description}
              </List.Item>
            )}
          />
          {projectFormOpen && (
            <Form
              form={projectForm}
              layout="vertical"
              onFinish={saveProject}
              className="profile-entry-form compact-form"
            >
              <div className="profile-entry-grid">
                <Form.Item name="name" label="项目名称" rules={[{ required: true }]}>
                  <Input placeholder="项目名称" />
                </Form.Item>
                <Form.Item name="role" label="担任角色">
                  <Input placeholder="担任角色" />
                </Form.Item>
                <Form.Item name="startDate" label="开始日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="endDate" label="结束日期">
                  <Input placeholder="YYYY-MM" />
                </Form.Item>
                <Form.Item name="sortOrder" label="排序" initialValue={0}>
                  <InputNumber min={0} className="full-width" />
                </Form.Item>
                <Form.Item name="description" label="项目描述" className="profile-entry-wide">
                  <Input.TextArea rows={3} placeholder="项目背景、行动和结果" />
                </Form.Item>
                <Form.Item className="profile-entry-actions">
                  <Space>
                    <Button type="primary" htmlType="submit">
                      {editingProject ? '保存修改' : '保存项目经历'}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingProject(null)
                        projectForm.resetFields()
                        setProjectFormOpen(false)
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </Form.Item>
              </div>
            </Form>
          )}
        </Card>
        <Card
          title="自定义资料字段"
          extra={
            <Button
              aria-label="添加自定义资料字段"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingField(null)
                fieldForm.resetFields()
                setFieldModalOpen(true)
              }}
            >
              添加字段
            </Button>
          }
        >
          {data.customFields.length ? (
            <div className="custom-fields-inline">
              {data.customFields.map((item) => (
                <span className="custom-field-entry" key={item.id}>
                  <Text className="custom-field-value" type="secondary">
                    {item.label}：{item.value || '未填写'}
                  </Text>
                  <Button
                    type="link"
                    aria-label={`编辑自定义字段：${item.label}`}
                    onClick={() => {
                      setEditingField(item)
                      fieldForm.setFieldsValue(item)
                      setFieldModalOpen(true)
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    aria-label={`删除自定义字段：${item.label}`}
                    onClick={async () => {
                      unwrap(await window.jobflow.profile.customFields.delete({ fieldKey: item.fieldKey }))
                      await reload()
                    }}
                  >
                    删除
                  </Button>
                </span>
              ))}
            </div>
          ) : (
            <Text type="secondary">记录作品集、博客或其他常用资料。</Text>
          )}
        </Card>
      </Space>
      <Modal
        title={editingField ? '编辑自定义资料字段' : '添加自定义资料字段'}
        open={fieldModalOpen}
        onCancel={() => {
          setFieldModalOpen(false)
          setEditingField(null)
          fieldForm.resetFields()
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={fieldForm} layout="vertical" onFinish={saveField} className="compact-form">
          <Form.Item name="fieldKey" label="字段键" rules={[{ required: true }]}>
            <Input placeholder="例如 portfolio" disabled={Boolean(editingField)} />
          </Form.Item>
          <Form.Item name="label" label="显示名称" rules={[{ required: true }]}>
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item name="value" label="内容">
            <Input placeholder="字段内容" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              {editingField ? '保存修改' : '添加字段'}
            </Button>
            <Button
              onClick={() => {
                setFieldModalOpen(false)
                setEditingField(null)
                fieldForm.resetFields()
              }}
            >
              取消
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
