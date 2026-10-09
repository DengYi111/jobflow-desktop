import { useEffect } from 'react'
import { AutoComplete, Button, Form, Input, Modal, Radio, Space, Typography } from 'antd'
import type { BrowserPageCapture, CompanySummary } from '../../../shared/contracts/api'
import { extractBrowserJob, type CompanySiteHint } from './page-extraction'

const { Text } = Typography
export interface CaptureFields {
  companyName: string
  title: string
  city?: string
  jobCode?: string
  deadline?: string
  requirements?: string
  applied: 'draft' | 'applied'
}

export function BrowserCaptureDialog({
  open,
  initialApplied = 'draft',
  page,
  companies,
  sites,
  saving,
  onCancel,
  onSave,
}: {
  open: boolean
  initialApplied?: 'draft' | 'applied'
  page: BrowserPageCapture
  companies: CompanySummary[]
  sites: CompanySiteHint[]
  saving: boolean
  onCancel: () => void
  onSave: (fields: CaptureFields) => void
}) {
  const [form] = Form.useForm<CaptureFields>()
  useEffect(() => {
    if (!open) return
    form.setFieldsValue({ ...extractBrowserJob(page, companies, sites), applied: initialApplied })
  }, [companies, form, initialApplied, open, page, sites])
  const companyOptions = companies.map((company) => ({ value: company.name, label: company.name }))

  return (
    <Modal title="确认收录岗位" open={open} onCancel={onCancel} footer={null} width={720} destroyOnHidden>
      <Text type="secondary">
        从当前网页提取到的内容已填入表单，请核对并补充后保存。无法识别的信息可手动填写。
      </Text>
      <Form form={form} layout="vertical" onFinish={onSave} className="browser-capture-form">
        <Form.Item
          name="companyName"
          label="公司"
          rules={[{ required: true, whitespace: true, message: '请填写公司名称' }]}
        >
          <AutoComplete
            options={companyOptions}
            filterOption={(input, option) =>
              option?.value.toLocaleLowerCase('zh-CN').includes(input.toLocaleLowerCase('zh-CN')) ?? false
            }
          >
            <Input placeholder="输入或选择公司名称" />
          </AutoComplete>
        </Form.Item>
        <Form.Item
          name="title"
          label="岗位名称"
          rules={[{ required: true, whitespace: true, message: '请填写岗位名称' }]}
        >
          <Input />
        </Form.Item>
        <div className="browser-capture-grid">
          <Form.Item name="city" label="城市">
            <Input />
          </Form.Item>
          <Form.Item name="jobCode" label="岗位编号">
            <Input />
          </Form.Item>
          <Form.Item name="deadline" label="截止日期">
            <Input placeholder="例如：2026-10-31" />
          </Form.Item>
        </div>
        <Form.Item name="requirements" label="岗位描述 / JD">
          <Input.TextArea rows={6} maxLength={20000} showCount />
        </Form.Item>
        <Form.Item name="applied" label="保存后阶段">
          <Radio.Group
            options={[
              { value: 'draft', label: '加入待投递' },
              { value: 'applied', label: '已经完成投递' },
            ]}
          />
        </Form.Item>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            确认并保存
          </Button>
        </Space>
      </Form>
    </Modal>
  )
}
