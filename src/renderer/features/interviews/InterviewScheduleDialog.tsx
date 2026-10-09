import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, message, Select } from 'antd'
import { InterviewRoundField } from './InterviewRoundField'
import {
  interviewTypeLabels,
  interviewTypes,
  type InterviewType,
} from '../../../shared/constants/interview-types'

type ScheduleValues = {
  roundMode: string
  customRoundNumber?: number
  interviewAt: string
  type?: InterviewType
}
type DeferredRound = { roundNumber: number; interviewAt: string }

function selectedRound(values: ScheduleValues): number {
  return values.roundMode === 'CUSTOM' ? values.customRoundNumber! : Number(values.roundMode)
}

export function InterviewScheduleDialog({
  applicationId,
  open,
  onCancel,
  onSaved,
  initialRoundNumber = 1,
  initialType = 'TECHNICAL',
}: {
  applicationId?: string
  open: boolean
  onCancel: () => void
  onSaved: () => void
  initialRoundNumber?: number
  initialType?: InterviewType
}) {
  const [form] = Form.useForm<ScheduleValues>()
  const [messageApi, contextHolder] = message.useMessage()
  const [deferredRound, setDeferredRound] = useState<DeferredRound>()
  const [missingRound, setMissingRound] = useState<number>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDeferredRound(undefined)
      setMissingRound(undefined)
      form.setFieldsValue({
        roundMode: initialRoundNumber <= 3 ? String(initialRoundNumber) : 'CUSTOM',
        customRoundNumber: initialRoundNumber > 3 ? initialRoundNumber : undefined,
        interviewAt: '',
        type: initialType,
      })
    } else {
      form.resetFields()
      setDeferredRound(undefined)
      setMissingRound(undefined)
    }
  }, [form, initialRoundNumber, initialType, open])

  async function createRound(
    roundNumber: number,
    interviewAt: string,
    type: InterviewType,
  ): Promise<string | null> {
    if (!applicationId) return '没有找到投递记录'
    const result = await window.jobflow.interviews.create({
      applicationId,
      roundNumber,
      interviewAt: new Date(interviewAt).toISOString(),
      type,
    })
    return result.ok ? null : result.messageZh
  }

  function requestMissingRound(message: string, target?: DeferredRound) {
    const match = message.match(/请先补充第 (\d+) 面的面试时间/)
    if (!match) {
      messageApi.error(message)
      return
    }
    const missing = Number(match[1])
    setDeferredRound(target)
    setMissingRound(missing)
    form.setFieldsValue({
      roundMode: missing <= 3 ? String(missing) : 'CUSTOM',
      customRoundNumber: missing > 3 ? missing : undefined,
      interviewAt: '',
    })
    messageApi.warning(`请先填写第 ${missing} 面的时间；保存后会继续安排原定轮次。`)
  }

  async function save(values: ScheduleValues) {
    if (!applicationId) return
    setBusy(true)
    try {
      const roundNumber = selectedRound(values)
      const type = values.type ?? initialType
      const firstError = await createRound(roundNumber, values.interviewAt, type)
      if (firstError) {
        requestMissingRound(firstError, deferredRound ?? { roundNumber, interviewAt: values.interviewAt })
        return
      }

      if (deferredRound) {
        const targetError = await createRound(deferredRound.roundNumber, deferredRound.interviewAt, type)
        if (targetError) {
          requestMissingRound(targetError, deferredRound)
          return
        }
      }

      setDeferredRound(undefined)
      setMissingRound(undefined)
      messageApi.success('面试已安排，岗位已移入面试中')
      onSaved()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '面试安排失败')
    } finally {
      setBusy(false)
    }
  }

  const requiredRound = missingRound
  return (
    <>
      {contextHolder}
      <Modal
        title={`安排第 ${initialRoundNumber} 面`}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <InterviewRoundField />
          <Form.Item name="type" label="面试类型" rules={[{ required: true }]}>
            <Select
              aria-label="面试类型"
              options={interviewTypes.map((type) => ({ value: type, label: interviewTypeLabels[type] }))}
            />
          </Form.Item>
          {requiredRound && (
            <p className="interview-round-help">
              请先安排第 {requiredRound} 面，保存后会继续安排原定的第 {deferredRound?.roundNumber} 面。
            </p>
          )}
          <Form.Item
            name="interviewAt"
            label="面试时间"
            rules={[{ required: true, message: '请选择面试时间' }]}
          >
            <Input aria-label="面试时间" type="datetime-local" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            {requiredRound ? `保存第 ${requiredRound} 面并继续` : '保存并进入面试中'}
          </Button>
        </Form>
      </Modal>
    </>
  )
}
