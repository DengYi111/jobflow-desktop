import { useEffect } from 'react'
import { Button, Form, Input, Modal, Space } from 'antd'

export interface ListingFields {
  url?: string | null
  source?: string | null
  pageTitle?: string | null
  capturedAt: string
  jdText?: string | null
}
export interface ListingInitialValue extends ListingFields {
  id: string
}

function localDateTime(value: string): string {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function JobListingForm({
  open,
  initial,
  onCancel,
  onSubmit,
  loading,
}: {
  open: boolean
  initial?: ListingInitialValue
  onCancel: () => void
  onSubmit: (values: ListingFields) => void
  loading?: boolean
}) {
  const [form] = Form.useForm<ListingFields>()
  const editing = Boolean(initial)
  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      url: initial?.url ?? '',
      source: initial?.source ?? '',
      pageTitle: initial?.pageTitle ?? '',
      capturedAt: localDateTime(initial?.capturedAt ?? new Date().toISOString()),
      jdText: initial?.jdText ?? '',
    })
  }, [form, initial, open])
  const submit = (values: ListingFields) => {
    const { capturedAt, jdText, ...fields } = values
    onSubmit({ ...fields, capturedAt: new Date(capturedAt).toISOString(), ...(editing ? {} : { jdText }) })
  }
  return (
    <Modal
      open={open}
      title={editing ? '编辑快照信息' : '添加招聘快照'}
      onCancel={onCancel}
      footer={null}
      width={720}
      forceRender
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="url" label="招聘页面链接">
          <Input placeholder="https://..." />
        </Form.Item>
        <div className="job-form-grid">
          <Form.Item name="source" label="来源">
            <Input placeholder="公司官网、招聘平台等" />
          </Form.Item>
          <Form.Item name="pageTitle" label="页面标题">
            <Input />
          </Form.Item>
          <Form.Item
            name="capturedAt"
            label="采集时间"
            rules={[{ required: true, message: '请选择采集时间' }]}
          >
            <Input type="datetime-local" />
          </Form.Item>
        </div>
        {!editing && (
          <Form.Item name="jdText" label="JD 原文快照">
            <Input.TextArea rows={8} placeholder="粘贴页面原始 JD；保存后可调整来源信息，原文保持不变。" />
          </Form.Item>
        )}
        {editing && (
          <p className="snapshot-preserve-note">编辑仅更新来源和采集信息，已保存的 JD 原文不会被覆盖。</p>
        )}
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {editing ? '保存快照信息' : '添加快照'}
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
