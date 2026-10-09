import { useEffect, useState } from 'react'
import { Button, Card, Select, Space, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'

const { Text } = Typography
type ResumeOption = { id: string; name: string }
type ApiResult<T> = { ok: true; data: T } | { ok: false; messageZh: string }

function data<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function JobResumeSelection({
  applicationId,
  resumeVersionId,
  onChanged,
}: {
  applicationId: string
  resumeVersionId: string | null
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [resumes, setResumes] = useState<ResumeOption[]>([])
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    void window.jobflow.resumes
      .list()
      .then((result) => setResumes(data(result) as ResumeOption[]))
      .catch((error) => messageApi.error(error instanceof Error ? error.message : '简历版本加载失败'))
  }, [messageApi])

  const save = async (nextResumeVersionId: string | null) => {
    setSaving(true)
    try {
      data(
        await window.jobflow.applications.setResumeVersion({
          id: applicationId,
          resumeVersionId: nextResumeVersionId,
        }),
      )
      messageApi.success('本岗位使用的简历版本已更新')
      onChanged()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '简历版本保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="本岗位投递简历">
      {contextHolder}
      <Space wrap>
        <Select
          aria-label="本岗位使用的简历版本"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="选择本岗位使用的简历"
          value={resumeVersionId ?? undefined}
          loading={saving}
          disabled={saving}
          style={{ minWidth: 280 }}
          options={resumes.map((resume) => ({ value: resume.id, label: resume.name }))}
          onChange={(value?: string) => void save(value ?? null)}
        />
        <Button onClick={() => navigate('/library')}>管理简历版本</Button>
      </Space>
      <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
        这里记录此公司岗位实际使用的唯一简历版本；修改不会更改投递时间或岗位阶段。
      </Text>
    </Card>
  )
}
