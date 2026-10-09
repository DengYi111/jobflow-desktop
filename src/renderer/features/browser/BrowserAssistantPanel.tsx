import { Button, Typography } from 'antd'
import { FormOutlined, PlusOutlined } from '@ant-design/icons'
import { BrowserProfileAssistant } from './BrowserProfileAssistant'

const { Text } = Typography

export function BrowserAssistantPanel({
  url,
  fillRequest,
  onFill,
  onCapture,
  onClose,
}: {
  url: string
  fillRequest: number
  onFill: () => void
  onCapture: () => void
  onClose: () => void
}) {
  return (
    <aside className="browser-assistant-panel" aria-label="投递助手">
      <header className="browser-assistant-panel-heading">
        <div>
          <Typography.Title level={5}>投递助手</Typography.Title>
          <Text type="secondary">仅填写表单，不会替你提交</Text>
        </div>
        <Button type="text" aria-label="收起投递助手" onClick={onClose}>
          收起
        </Button>
      </header>
      <div className="browser-assistant-actions">
        <Button type="primary" icon={<FormOutlined />} onClick={onFill}>
          一键填写
        </Button>
        <Button icon={<PlusOutlined />} onClick={onCapture}>
          收录岗位
        </Button>
      </div>
      <BrowserProfileAssistant url={url} fillRequest={fillRequest} embedded onClose={() => undefined} />
    </aside>
  )
}
