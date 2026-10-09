import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Select, message } from 'antd'
import type { ApplicationStage } from '../../../shared/constants/stages'
import { selectableApplicationStages, stageLabels } from '../../../shared/constants/stages'
import type { CloseReason } from '../../../shared/contracts/api'
import { InterviewScheduleDialog } from '../interviews/InterviewScheduleDialog'

const closeReasons: Array<{ value: CloseReason; label: string }> = [
  { value: 'REJECTED', label: '未通过' },
  { value: 'VOLUNTARY', label: '主动退出' },
  { value: 'HC_CLOSED', label: '岗位关闭' },
  { value: 'NO_RESPONSE', label: '长期无回复' },
  { value: 'OFFER_DECLINED', label: '拒绝 Offer' },
  { value: 'OTHER', label: '其他' },
]

const localDateTime = (value: string) => {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function StageSelect({
  id,
  value,
  onChanged,
  onSubmitRequested,
}: {
  id: string
  value: ApplicationStage
  onChanged: () => void
  onSubmitRequested: () => void
}) {
  const [target, setTarget] = useState<ApplicationStage>()
  const [reason, setReason] = useState<CloseReason>()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  async function move(
    stage: ApplicationStage,
    options: { closeReason?: CloseReason; cancelOpenInterviews?: boolean } = {},
  ) {
    setBusy(true)
    try {
      const result = await window.jobflow.applications.transition({ id, stage, ...options })
      if (!result.ok) throw new Error(result.messageZh)
      setTarget(undefined)
      setReason(undefined)
      messageApi.success('阶段已更新')
      onChanged()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '阶段更新失败')
    } finally {
      setBusy(false)
    }
  }

  function chooseStage(stage: ApplicationStage) {
    if (stage === 'APPLIED') {
      onSubmitRequested()
      return
    }
    if (stage === 'INTERVIEW_PENDING') {
      setScheduleOpen(true)
      return
    }
    setTarget(stage)
    setReason(undefined)
  }

  const needsInterviewConfirmation = value === 'INTERVIEW_PENDING'
  return (
    <>
      {contextHolder}
      <Select
        aria-label="投递阶段"
        value={value}
        style={{ minWidth: 140 }}
        options={selectableApplicationStages.map((stage) => ({
          value: stage,
          label: stageLabels['zh-CN'][stage],
        }))}
        onChange={chooseStage}
      />
      <Modal
        title={target === 'CLOSED' ? '结束投递流程' : '确认更改面试阶段'}
        open={Boolean(target)}
        onCancel={() => {
          setTarget(undefined)
          setReason(undefined)
        }}
        onOk={() => {
          if (target)
            void move(target, {
              ...(reason ? { closeReason: reason } : {}),
              ...(needsInterviewConfirmation ? { cancelOpenInterviews: true } : {}),
            })
        }}
        okText="确认"
        cancelText="返回"
        okButtonProps={{ disabled: target === 'CLOSED' && !reason, loading: busy }}
      >
        {needsInterviewConfirmation ? (
          <p>更改阶段后，会取消此岗位所有未完成面试日程；面试记录、题目和复盘仍会保留。</p>
        ) : (
          <p>请选择结束原因，此记录会保留在时间线中。</p>
        )}
        {target === 'CLOSED' && (
          <Select
            value={reason}
            onChange={setReason}
            placeholder="选择原因"
            options={closeReasons}
            style={{ width: '100%' }}
          />
        )}
      </Modal>
      <InterviewScheduleDialog
        applicationId={id}
        open={scheduleOpen}
        onCancel={() => setScheduleOpen(false)}
        onSaved={() => {
          setScheduleOpen(false)
          onChanged()
        }}
      />
    </>
  )
}

export function NextActionForm({
  id,
  initialAction,
  initialAt,
  onSaved,
}: {
  id: string
  initialAction?: string | null
  initialAt?: string | null
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(
    () =>
      form.setFieldsValue({
        nextAction: initialAction ?? '',
        nextActionAt: initialAt ? localDateTime(initialAt) : '',
      }),
    [form, initialAction, initialAt],
  )

  async function save(values: { nextAction?: string; nextActionAt?: string }) {
    setBusy(true)
    try {
      const result = await window.jobflow.applications.setNextAction({
        id,
        nextAction: values.nextAction?.trim() || null,
        nextActionAt: values.nextActionAt ? new Date(values.nextActionAt).toISOString() : null,
      })
      if (!result.ok) throw new Error(result.messageZh)
      messageApi.success('下一步行动已保存')
      onSaved()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={save}>
      {contextHolder}
      <Form.Item name="nextAction" label="下一步行动">
        <Input placeholder="例如：准备技术面" />
      </Form.Item>
      <Form.Item name="nextActionAt" label="计划时间">
        <Input type="datetime-local" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={busy}>
        保存行动
      </Button>
    </Form>
  )
}

export function SubmissionDialog({
  id,
  onSubmitted,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  id: string
  onSubmitted: () => Promise<boolean | void> | boolean | void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setInternalOpen(next))
  const [form] = Form.useForm()
  const [resumes, setResumes] = useState<Array<{ id: string; name: string }>>([])
  const [busy, setBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (open)
      form.setFieldsValue({
        appliedAt: localDateTime(new Date().toISOString()),
        resumeVersionId: undefined,
        channel: '官网',
        notes: '',
      })
  }, [open, form])

  useEffect(() => {
    if (!open) return
    void window.jobflow.resumes.list().then((result) => {
      if (result.ok) setResumes(result.data as Array<{ id: string; name: string }>)
      else messageApi.error(result.messageZh)
    })
  }, [open, messageApi])

  async function submit(
    values: { appliedAt: string; resumeVersionId: string | null; channel: string; notes?: string },
    cancelOpenInterviews = false,
  ) {
    setBusy(true)
    let saved = false
    try {
      const result = await window.jobflow.applications.submit({
        id,
        appliedAt: new Date(values.appliedAt).toISOString(),
        resumeVersionId: values.resumeVersionId ?? null,
        channel: values.channel,
        notes: values.notes,
        ...(cancelOpenInterviews ? { cancelOpenInterviews: true } : {}),
      })
      if (!result.ok) throw new Error(result.messageZh)
      setOpen(false)
      form.resetFields()
      saved = true
    } catch (error) {
      const text = error instanceof Error ? error.message : '投递记录失败'
      if (!cancelOpenInterviews && text.includes('确认取消')) {
        Modal.confirm({
          title: '确认更改面试阶段',
          content: '标记已投递后，会取消此岗位所有未完成的面试日程；面试记录、题目和复盘仍会保留。',
          okText: '确认并投递',
          cancelText: '返回',
          onOk: () => submit(values, true),
        })
      } else messageApi.error(text)
    } finally {
      setBusy(false)
    }
    if (saved) {
      try {
        const refreshed = await onSubmitted()
        if (refreshed === false) messageApi.warning('投递信息已保存，但页面刷新失败，请重试')
        else messageApi.success('投递信息已保存')
      } catch (error) {
        messageApi.warning(
          `投递信息已保存，但页面刷新失败：${error instanceof Error ? error.message : '请重试'}`,
        )
      }
    }
  }

  return (
    <>
      {contextHolder}
      {showTrigger && (
        <Button type="primary" onClick={() => setOpen(true)}>
          标记已投递
        </Button>
      )}
      <Modal title="记录投递信息" open={open} onCancel={() => setOpen(false)} footer={null} forceRender>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="appliedAt" label="投递时间" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="resumeVersionId" label="使用的简历">
            <Select
              allowClear
              placeholder="选择简历版本"
              options={resumes.map((resume) => ({ value: resume.id, label: resume.name }))}
            />
          </Form.Item>
          <Form.Item name="channel" label="投递渠道" rules={[{ required: true }]}>
            <Input placeholder="官网、招聘平台等" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            保存投递
          </Button>
        </Form>
      </Modal>
    </>
  )
}
