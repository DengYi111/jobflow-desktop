import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Empty, Space, Tag, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  interviewRoundLabel,
  interviewTypeLabels,
  type InterviewType,
} from '../../../shared/constants/interview-types'

const { Text } = Typography
type Question = {
  id: string
  interviewId: string
  question: string
  category: string
  round: string
  roundNumber: number | null
  type: InterviewType
  interviewAt: string
  completedAt: string | null
  cancelledAt: string | null
  myAnswer: string | null
  betterAnswer: string | null
  notes: string | null
}

export function JobInterviewQuestions({
  applicationId,
  refreshKey,
}: {
  applicationId: string
  refreshKey: number
}) {
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<Question[]>([])
  const [messageApi, contextHolder] = message.useMessage()
  const load = useCallback(async () => {
    const result = await window.jobflow.interviews.questions.listByApplication({ id: applicationId })
    if (!result.ok) throw new Error(result.messageZh)
    setQuestions(result.data as Question[])
  }, [applicationId])

  useEffect(() => {
    void load().catch((error) =>
      messageApi.error(error instanceof Error ? error.message : '岗位面试题加载失败'),
    )
  }, [load, messageApi, refreshKey])

  const rounds = new Map<string, Question[]>()
  for (const question of questions) {
    const key = question.interviewId
    rounds.set(key, [...(rounds.get(key) ?? []), question])
  }

  return (
    <Space orientation="vertical" size="middle" className="full-width">
      {contextHolder}
      <div className="snapshot-heading">
        <Text type="secondary">本岗位各轮面试题目与面试管理共用同一份记录。</Text>
        <Button type="primary" onClick={() => navigate('/interviews')}>
          打开面试管理
        </Button>
      </div>
      {rounds.size === 0 ? (
        <Empty description="本岗位还没有记录面试题目" />
      ) : (
        [...rounds.entries()].map(([key, roundQuestions]) => {
          const round = roundQuestions[0]
          const roundLabel = round.roundNumber == null ? round.round : interviewRoundLabel(round.roundNumber)
          return (
            <Card
              key={key}
              size="small"
              title={`${roundLabel} · ${interviewTypeLabels[round.type]}`}
              extra={
                <Space>
                  <Text type="secondary">{new Date(round.interviewAt).toLocaleString('zh-CN')}</Text>
                  {round.cancelledAt ? (
                    <Tag>已取消</Tag>
                  ) : round.completedAt ? (
                    <Tag color="green">已完成</Tag>
                  ) : null}
                </Space>
              }
            >
              <Space orientation="vertical" size={8} className="full-width">
                {roundQuestions.map((question) => (
                  <div key={question.id} className="job-interview-question">
                    <Space orientation="vertical" size={4} className="full-width">
                      <Space wrap>
                        <Tag>{question.category}</Tag>
                        <Text>{question.question}</Text>
                      </Space>
                      {question.myAnswer && <Text type="secondary">我的回答：{question.myAnswer}</Text>}
                      {question.betterAnswer && (
                        <Text type="secondary">参考回答：{question.betterAnswer}</Text>
                      )}
                      {question.notes && <Text type="secondary">备注：{question.notes}</Text>}
                    </Space>
                  </div>
                ))}
              </Space>
            </Card>
          )
        })
      )}
    </Space>
  )
}
