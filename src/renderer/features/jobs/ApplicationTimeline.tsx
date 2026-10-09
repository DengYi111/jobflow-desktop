import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd'
import { applicationEventTypes, stageLabels, type ApplicationStage } from '../../../shared/constants/stages'
import { interviewRoundLabel, interviewTypeLabels } from '../../../shared/constants/interview-types'
import { useJobFlowChanges } from '../../app/useJobFlowChanges'

type TimelineEvent = {
  id: string
  title: string
  type: string
  stage?: ApplicationStage | null
  eventAt: string
  channel?: string | null
  notes?: string | null
  interviewId?: string | null
  interviewRoundNumber?: number | null
  interviewType?: string | null
}
type EventForm = { title: string; type?: 'NOTE' | 'OTHER'; at: string; notes?: string }
const manualTypes = applicationEventTypes.filter(
  (type): type is 'NOTE' | 'OTHER' => type === 'NOTE' || type === 'OTHER',
)
const localDateTime = (value: string) => {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function ApplicationTimeline({
  applicationId,
  onChanged,
}: {
  applicationId: string
  onChanged: () => void
}) {
  const changeVersion = useJobFlowChanges(['applications', 'interviews'])
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TimelineEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm<EventForm>()
  const [msg, holder] = message.useMessage()

  const load = useCallback(async () => {
    const result = await window.jobflow.applications.listTimeline({ id: applicationId })
    if (result.ok)
      setEvents(
        (result.data as TimelineEvent[])
          .slice()
          .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt)),
      )
    else msg.error(result.messageZh)
  }, [applicationId, msg])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (changeVersion) void load()
  }, [changeVersion, load])
  useEffect(() => {
    if (!open) return
    if (editing)
      form.setFieldsValue({
        at: localDateTime(editing.eventAt),
        title: editing.title,
        notes: editing.notes ?? '',
      })
    else
      form.setFieldsValue({ type: 'NOTE', at: localDateTime(new Date().toISOString()), title: '', notes: '' })
  }, [editing, form, open])

  function startAdd() {
    setEditing(null)
    setOpen(true)
  }
  function startEdit(event: TimelineEvent) {
    setEditing(event)
    setOpen(true)
  }
  async function save(values: EventForm) {
    setBusy(true)
    try {
      const input = {
        title: values.title.trim(),
        at: new Date(values.at).toISOString(),
        notes: values.notes,
      }
      const result = editing
        ? await window.jobflow.applications.updateEvent({ id: editing.id, ...input })
        : await window.jobflow.applications.addEvent({
            id: applicationId,
            ...input,
            type: values.type ?? 'NOTE',
          })
      if (!result.ok) throw new Error(result.messageZh)
      msg.success(editing ? '时间线记录已更新' : '时间线记录已添加')
      setOpen(false)
      setEditing(null)
      form.resetFields()
      await load()
      onChanged()
    } catch (error) {
      msg.error(error instanceof Error ? error.message : '保存记录失败')
    } finally {
      setBusy(false)
    }
  }
  async function remove(event: TimelineEvent) {
    try {
      const result = await window.jobflow.applications.deleteEvent({ id: event.id })
      if (!result.ok) throw new Error(result.messageZh)
      msg.success('时间线记录已删除')
      await load()
      onChanged()
    } catch (error) {
      msg.error(error instanceof Error ? error.message : '删除记录失败')
    }
  }

  return (
    <div className="application-timeline">
      {holder}
      <Space className="timeline-heading">
        <Typography.Title level={5}>流程时间线</Typography.Title>
        <Button onClick={startAdd}>添加记录</Button>
      </Space>
      {events.length ? (
        <Timeline
          items={events.map((event) => {
            const manual = (event.type === 'NOTE' || event.type === 'OTHER') && !event.stage
            const roundMarker = Boolean(event.interviewId && event.interviewRoundNumber)
            const canonicalRoundTitle = roundMarker ? `第 ${event.interviewRoundNumber} 面` : null
            const roundTitle =
              roundMarker && event.title === canonicalRoundTitle
                ? `${interviewRoundLabel(event.interviewRoundNumber!)}${event.interviewType && event.interviewType in interviewTypeLabels ? `·${interviewTypeLabels[event.interviewType as keyof typeof interviewTypeLabels]}` : ''}`
                : event.title
            return {
              key: event.id,
              content: (
                <div className="timeline-event">
                  <div className="timeline-event-heading">
                    <Space wrap>
                      <Typography.Text strong>{roundTitle}</Typography.Text>
                      {roundMarker ? (
                        <Tag>{stageLabels['zh-CN'].INTERVIEW_DONE}</Tag>
                      ) : event.stage ? (
                        <Tag>{stageLabels['zh-CN'][event.stage]}</Tag>
                      ) : manual ? (
                        <Tag color="blue">手动记录</Tag>
                      ) : null}
                      <Typography.Text type="secondary">
                        {new Date(event.eventAt).toLocaleString('zh-CN', { hour12: false })}
                      </Typography.Text>
                    </Space>
                    <Space size="small">
                      <Button type="link" onClick={() => startEdit(event)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="删除这条时间线记录？"
                        description={
                          event.interviewId
                            ? '只删除时间线标记，会保留面试日程和复盘资料。'
                            : '删除后无法恢复。'
                        }
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => void remove(event)}
                      >
                        <Button type="link" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                  {roundMarker && (
                    <Typography.Text type="secondary">
                      面试时间：{new Date(event.eventAt).toLocaleString('zh-CN', { hour12: false })}
                    </Typography.Text>
                  )}
                  {event.channel && <Typography.Text type="secondary">渠道：{event.channel}</Typography.Text>}
                  {event.notes && (
                    <Typography.Paragraph type="secondary" className="timeline-event-notes">
                      {event.notes}
                    </Typography.Paragraph>
                  )}
                </div>
              ),
            }
          })}
        />
      ) : (
        <Typography.Text type="secondary">
          还没有流程记录。投递、阶段变更和手动备注会按时间显示在这里。
        </Typography.Text>
      )}
      <Modal
        title={editing ? '编辑流程记录' : '添加流程记录'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditing(null)
          form.resetFields()
        }}
        footer={null}
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={save} className="compact-form">
          <Form.Item
            name="title"
            label="记录标题"
            rules={[{ required: true, whitespace: true, message: '请填写记录标题' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <div className="timeline-form-grid">
            {!editing && (
              <Form.Item name="type" label="记录类型" rules={[{ required: true }]}>
                <Select
                  options={manualTypes.map((type) => ({
                    value: type,
                    label: type === 'NOTE' ? '备注' : '其他',
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item name="at" label="发生时间" rules={[{ required: true, message: '请选择发生时间' }]}>
              <Input type="datetime-local" />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="补充说明">
            <Input.TextArea rows={3} maxLength={10000} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              {editing ? '保存修改' : '保存记录'}
            </Button>
            <Button onClick={() => setOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

export function ReminderForm({ applicationId, onCreated }: { applicationId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [msg, holder] = message.useMessage()
  useEffect(() => {
    if (open) form.setFieldsValue({ remindAt: localDateTime(new Date().toISOString()) })
  }, [form, open])
  const create = async (values: { title: string; remindAt: string }) => {
    setBusy(true)
    try {
      const result = await window.jobflow.reminders.create({
        applicationId,
        title: values.title,
        remindAt: new Date(values.remindAt).toISOString(),
      })
      if (!result.ok) throw new Error(result.messageZh)
      msg.success('提醒已添加')
      form.resetFields()
      setOpen(false)
      onCreated()
    } catch (error) {
      msg.error(error instanceof Error ? error.message : '提醒保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {holder}
      <Button onClick={() => setOpen(true)}>添加待办提醒</Button>
      <Modal title="新建待办提醒" open={open} onCancel={() => setOpen(false)} footer={null} forceRender>
        <Form form={form} layout="vertical" onFinish={create} className="compact-form">
          <Form.Item name="title" label="提醒内容" rules={[{ required: true, whitespace: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="remindAt" label="提醒时间" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存提醒
          </Button>
        </Form>
      </Modal>
    </>
  )
}
