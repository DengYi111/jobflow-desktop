import { Fragment, type ReactNode } from 'react'

type Segment = { kind: 'text'; value: string } | { kind: 'code'; value: string; language?: string }

const codeLinePattern =
  /^\s*(?:#\s*include\b|(?:public|private|protected|static|const|let|var|return|throw|if|else|for|while|switch|case|break|continue|class|struct|enum|typedef|using|namespace|function|def|fn|import|export)\b|(?:\w[\w:*&<>\[\]]*\s+)+\w+\s*\([^)]*\)\s*\{?|[\w.\[\]-]+\s*(?:=|==|!=|\+=|-=|->|=>)\s*.+[;{]?|[{}]\s*;?|\w[^\n]*;\s*$)/u

function looksLikeCode(line: string): boolean {
  const value = line.trim()
  if (!value || value.length > 180) return false
  return codeLinePattern.test(value)
}

function classifyPlainText(value: string): Segment[] {
  const segments: Segment[] = []
  const lines = value.split('\n')
  let textLines: string[] = []
  let codeLines: string[] = []

  const flushText = () => {
    if (textLines.length) segments.push({ kind: 'text', value: textLines.join('\n') })
    textLines = []
  }
  const flushCode = () => {
    if (codeLines.length) segments.push({ kind: 'code', value: codeLines.join('\n').replace(/\n+$/u, '') })
    codeLines = []
  }

  for (const line of lines) {
    if (looksLikeCode(line)) {
      flushText()
      codeLines.push(line)
    } else {
      flushCode()
      textLines.push(line)
    }
  }
  flushCode()
  flushText()
  return segments
}

function parseAnswer(value: string): Segment[] {
  const segments: Segment[] = []
  const fence = /```([\w+#.-]*)\s*\n([\s\S]*?)```/gu
  let cursor = 0

  for (const match of value.matchAll(fence)) {
    const index = match.index ?? 0
    if (index > cursor) segments.push(...classifyPlainText(value.slice(cursor, index)))
    segments.push({ kind: 'code', value: match[2].replace(/\n+$/u, ''), language: match[1] || undefined })
    cursor = index + match[0].length
  }

  if (cursor < value.length) segments.push(...classifyPlainText(value.slice(cursor)))
  return segments
}

function renderText(value: string): ReactNode {
  return value.split(/(`[^`\n]+`)/gu).map((part, index) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code className="question-answer-inline-code" key={index}>
        {part.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={index}>
        {part.split('\n').map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </Fragment>
    ),
  )
}

export function QuestionAnswerContent({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) return <span className="question-answer-empty">暂无内容</span>

  return (
    <div className="question-answer-content">
      {parseAnswer(value).map((segment, index) =>
        segment.kind === 'code' ? (
          <pre className="question-answer-code" key={index}>
            {segment.language && <span className="question-answer-code-language">{segment.language}</span>}
            <code>{segment.value}</code>
          </pre>
        ) : (
          <p key={index}>{renderText(segment.value)}</p>
        ),
      )}
    </div>
  )
}
