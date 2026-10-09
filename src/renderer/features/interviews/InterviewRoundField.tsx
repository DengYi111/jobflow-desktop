import { Form, InputNumber, Select } from 'antd'
import { interviewRoundLabel } from '../../../shared/constants/interview-types'

export function InterviewRoundField() {
  const options = [
    { value: '1', label: interviewRoundLabel(1) },
    { value: '2', label: interviewRoundLabel(2) },
    { value: '3', label: interviewRoundLabel(3) },
    { value: 'CUSTOM', label: '自定义 n 面' },
  ]

  return (
    <>
      <Form.Item name="roundMode" label="轮次" rules={[{ required: true, message: '请选择面试轮次' }]}>
        <Select options={options} />
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(previous, current) => previous.roundMode !== current.roundMode}>
        {({ getFieldValue }) =>
          getFieldValue('roundMode') === 'CUSTOM' ? (
            <Form.Item
              name="customRoundNumber"
              label="自定义轮次"
              rules={[{ required: true, message: '请输入轮次编号' }]}
            >
              <InputNumber min={4} precision={0} addonBefore="第" addonAfter="面" />
            </Form.Item>
          ) : null
        }
      </Form.Item>
    </>
  )
}
