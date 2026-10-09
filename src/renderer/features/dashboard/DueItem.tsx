import { CheckCircleOutlined } from '@ant-design/icons'
import { Button, List, Tag, message } from 'antd'
import type { DueItem } from '../../../shared/contracts/api'
import { formatLocalDateTime, isBeforeLocalToday } from './due-date'
export function DueItemRow({
  item,
  onDone,
  onOpen,
}: {
  item: DueItem
  onDone: () => void
  onOpen: () => void
}) {
  const [msg, holder] = message.useMessage()
  const complete = async () => {
    const result = await window.jobflow.reminders.complete({ id: item.id })
    if (!result.ok) {
      msg.error(result.messageZh)
      return
    }
    msg.success('已完成')
    onDone()
  }
  const overdue = isBeforeLocalToday(item.dueAt)
  return (
    <List.Item
      actions={[
        <Button key="open" type="link" onClick={onOpen}>
          进入岗位
        </Button>,
        <Button key="done" icon={<CheckCircleOutlined />} onClick={() => void complete()}>
          完成
        </Button>,
      ]}
    >
      {holder}
      <List.Item.Meta
        title={item.title}
        description={
          <span>
            {item.jobTitle} · {formatLocalDateTime(item.dueAt)} {overdue && <Tag color="red">已逾期</Tag>}
          </span>
        }
      />
    </List.Item>
  )
}
