import { Button, Modal, Space, Typography } from 'antd'
import type { JobRow } from './JobTable'

export function DuplicateWarning({
  open,
  matches,
  onCancel,
  onContinue,
  onOpen,
}: {
  open: boolean
  matches: JobRow[]
  onCancel: () => void
  onContinue: () => void
  onOpen: (jobId: string) => void
}) {
  return (
    <Modal
      title="发现相似岗位"
      open={open}
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onCancel}>返回修改</Button>
          <Button type="primary" onClick={onContinue}>
            仍然新增
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph>
        这些记录的招聘链接或公司与岗位名称相似。你可以查看已有记录，也可以继续新增。
      </Typography.Paragraph>
      <div role="list" className="duplicate-results">
        {matches.map((job) => (
          <div role="listitem" className="duplicate-row" key={job.id}>
            <div>
              <Typography.Text strong>
                {job.companyName} · {job.title}
              </Typography.Text>
              <br />
              <Typography.Text type="secondary">
                {job.city || '城市未填写'} · {job.stage}
              </Typography.Text>
            </div>
            <Button type="link" onClick={() => onOpen(job.id)}>
              打开已有岗位
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
