import { EditOutlined } from '@ant-design/icons'
import { Button, Collapse, Descriptions, Drawer, Form, Input, message, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { ApiResult } from '../../../shared/contracts/api'
import { QuestionAnswerContent } from './QuestionAnswerContent'

const { Text, Title } = Typography

export type InterviewQuestion = {
  id: string
  interviewId: string
  question: string
  category: string
  myAnswer: string | null
  betterAnswer: string | null
  notes: string | null
  companyName: string
  companyId: string
  jobTitle: string
  jobId: string
  occurrenceCount: number
  normalizedQuestion: string
  round: string
  interviewAt?: string
}

type Props = {
  question: InterviewQuestion | null
  onClose: () => void
  onUpdated: (question: InterviewQuestion) => void
}

type QuestionFormValues = Pick<
  InterviewQuestion,
  'question' | 'category' | 'myAnswer' | 'betterAnswer' | 'notes'
>

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function InterviewQuestionDetailDrawer({ question, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<QuestionFormValues>({
    question: '',
    category: '',
    myAnswer: null,
    betterAnswer: null,
    notes: null,
  })
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    setEditing(false)
    if (question)
      setDraft({
        question: question.question,
        category: question.category,
        myAnswer: question.myAnswer,
        betterAnswer: question.betterAnswer,
        notes: question.notes,
      })
  }, [question])

  async function save(values: QuestionFormValues) {
    if (!question) return
    if (!values.question.trim() || !values.category.trim()) {
      messageApi.warning('题目和分类不能为空')
      return
    }
    setSaving(true)
    try {
      const updated = unwrap(
        await window.jobflow.interviews.questions.update({
          id: question.id,
          question: values.question.trim(),
          category: values.category.trim(),
          myAnswer: values.myAnswer?.trim() || null,
          betterAnswer: values.betterAnswer?.trim() || null,
          notes: values.notes?.trim() || null,
        }),
      ) as InterviewQuestion
      onUpdated({ ...question, ...updated })
      setEditing(false)
      messageApi.success('题目解析已保存')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '题目解析保存失败')
    } finally {
      setSaving(false)
    }
  }

  const sections = question
    ? [
        { key: 'myAnswer', label: '我的答案', value: question.myAnswer },
        { key: 'betterAnswer', label: '更好的答案', value: question.betterAnswer },
        { key: 'notes', label: '备注', value: question.notes },
      ]
    : []

  return (
    <Drawer
      title="面试题解析"
      open={Boolean(question)}
      onClose={onClose}
      width={720}
      destroyOnClose
      className="interview-question-drawer"
      extra={
        question && !editing ? (
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            编辑解析
          </Button>
        ) : null
      }
    >
      {contextHolder}
      {question && (
        <div className="interview-question-detail">
          <div className="interview-question-detail-heading">
            <Space wrap>
              <Tag color="blue">{question.category}</Tag>
              <Tag>{question.occurrenceCount} 次记录</Tag>
            </Space>
            <Title level={4}>{question.question}</Title>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="公司 / 岗位">
                {question.companyName} · {question.jobTitle}
              </Descriptions.Item>
              <Descriptions.Item label="面试阶段">{question.round}</Descriptions.Item>
            </Descriptions>
          </div>

          {editing ? (
            <Form layout="vertical" className="question-detail-form">
              <Form.Item label="题目" htmlFor="question-detail-question">
                <Input.TextArea
                  id="question-detail-question"
                  value={draft.question}
                  onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                />
              </Form.Item>
              <Form.Item label="分类" htmlFor="question-detail-category">
                <Input
                  id="question-detail-category"
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                />
              </Form.Item>
              <Form.Item label="我的答案" htmlFor="question-detail-my-answer">
                <Input.TextArea
                  id="question-detail-my-answer"
                  value={draft.myAnswer ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, myAnswer: event.target.value }))}
                  autoSize={{ minRows: 5, maxRows: 16 }}
                  placeholder="支持 Markdown 代码围栏，例如 ```c ... ```"
                />
              </Form.Item>
              <Form.Item label="更好的答案" htmlFor="question-detail-better-answer">
                <Input.TextArea
                  id="question-detail-better-answer"
                  value={draft.betterAnswer ?? ''}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, betterAnswer: event.target.value }))
                  }
                  autoSize={{ minRows: 5, maxRows: 16 }}
                  placeholder="可以记录更完整的思路或标准答案"
                />
              </Form.Item>
              <Form.Item label="备注" htmlFor="question-detail-notes">
                <Input.TextArea
                  id="question-detail-notes"
                  value={draft.notes ?? ''}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  autoSize={{ minRows: 3, maxRows: 10 }}
                />
              </Form.Item>
              <Space>
                <Button type="primary" loading={saving} onClick={() => void save(draft)}>
                  保存修改
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    if (question)
                      setDraft({
                        question: question.question,
                        category: question.category,
                        myAnswer: question.myAnswer,
                        betterAnswer: question.betterAnswer,
                        notes: question.notes,
                      })
                    setEditing(false)
                  }}
                >
                  取消
                </Button>
              </Space>
            </Form>
          ) : (
            <div className="interview-question-answer-sections">
              <Text type="secondary">答案、参考思路和备注分别收纳，可按需展开。</Text>
              <Collapse
                className="question-answer-collapse"
                defaultActiveKey={sections.filter((section) => section.value?.trim()).map(({ key }) => key)}
                items={sections.map((section) => ({
                  key: section.key,
                  label: section.label,
                  children: <QuestionAnswerContent value={section.value} />,
                }))}
              />
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
