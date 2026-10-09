import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, List, Modal, Select, Spin, Tag, Typography, message } from 'antd'
import type { BrowserAutofillMappingInput, BrowserFormField } from '../../../shared/contracts/api'
import { adapterForHostname } from './autofill-adapters'
import { matchAutofillField } from './autofill-matcher'
import {
  buildAutofillSources,
  formatAutofillValue,
  type AutofillProfile,
  type AutofillSource,
} from './profile-autofill'

const { Text } = Typography
type SourceKey = BrowserAutofillMappingInput['sourceKey']
type AssistedField = BrowserFormField & {
  sourceKey?: SourceKey
  selected: boolean
  manual?: boolean
  selectionTouched?: boolean
  confidence: number
  evidence: string
}
type ProfileSnapshot = AutofillProfile & {
  profile?: Record<string, string | null>
  education?: Array<Record<string, string | null> & { id?: string }>
  internships?: Array<Record<string, string | null> & { id?: string }>
  projects?: Array<Record<string, string | null> & { id?: string }>
}
type FillReport = { filled: number; uploaded: number; selected: number; unmatched: number; failed: number }

function unwrap<T>(result: { ok: true; data: T } | { ok: false; messageZh: string }): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

function mapFormFields(
  formFields: BrowserFormField[],
  sources: AutofillSource[],
  savedMappings: Record<string, string>,
  hostname: string,
  previousFields: AssistedField[] = [],
): AssistedField[] {
  const adapter = adapterForHostname(hostname)
  const occurrences = new Map<string, number>()
  return formFields.map((field) => {
    const previous = previousFields.find(
      (item) => item.index === field.index && item.signature === field.signature,
    )
    const rememberedKey = savedMappings[field.signature]
    const remembered = previous?.manual ? previous.sourceKey : rememberedKey
    const match = matchAutofillField(field, sources, adapter, remembered, occurrences)
    const selected = previous?.selectionTouched
      ? previous.selected
      : match.confidence >= 0.85 && Boolean(match.source)
    return {
      ...field,
      sourceKey: match.source?.key,
      selected,
      manual: previous?.manual,
      selectionTouched: previous?.selectionTouched,
      confidence: match.confidence,
      evidence: match.evidence,
    }
  })
}

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.85) return { text: `高 ${Math.round(confidence * 100)}%`, color: 'green' }
  if (confidence >= 0.6) return { text: `需确认 ${Math.round(confidence * 100)}%`, color: 'orange' }
  if (confidence > 0) return { text: `低 ${Math.round(confidence * 100)}%`, color: 'default' }
  return { text: '未识别', color: 'red' }
}

export function BrowserProfileAssistant({
  url,
  fillRequest = 0,
  embedded = false,
  onClose,
}: {
  url?: string
  fillRequest?: number
  embedded?: boolean
  onClose: () => void
}) {
  const [fields, setFields] = useState<AssistedField[]>([])
  const [sources, setSources] = useState<AutofillSource[]>([])
  const [savedMappings, setSavedMappings] = useState<Record<string, string>>({})
  const [experienceCounts, setExperienceCounts] = useState({
    educationCount: 0,
    internshipCount: 0,
    projectCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [fillPending, setFillPending] = useState(false)
  const [report, setReport] = useState<FillReport | null>(null)
  const filling = useRef(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (!url) return
    let mounted = true
    setLoading(true)
    const hostname = new URL(url).hostname
    void Promise.all([
      window.jobflow.profile.get(),
      window.jobflow.browser.listAutofillMappings({ hostname }),
      window.jobflow.resumes.list(),
    ])
      .then(async ([profileResult, mappingResult, resumeResult]) => {
        const profile = unwrap(profileResult) as ProfileSnapshot
        const resumeSources = (
          unwrap(resumeResult) as Array<{ id: string; originalName: string; name: string }>
        ).map((resume) => ({
          key: `resume.${resume.id}`,
          label: `简历 · ${resume.name || resume.originalName}`,
          value: resume.originalName,
          kind: 'file' as const,
          resumeId: resume.id,
        }))
        const profileSources = [...buildAutofillSources(profile), ...resumeSources]
        const profileCounts = {
          educationCount: profile.education?.length ?? 0,
          internshipCount: profile.internships?.length ?? 0,
          projectCount: profile.projects?.length ?? 0,
        }
        const formResult = await window.jobflow.browser.inspectForm(profileCounts)
        if (!mounted) return
        const mappingRecord = Object.fromEntries(
          (unwrap(mappingResult) as Array<{ signature: string; sourceKey: string }>).map((item) => [
            item.signature,
            item.sourceKey,
          ]),
        )
        const formFields = unwrap(formResult) as BrowserFormField[]
        setSources(profileSources)
        setSavedMappings(mappingRecord)
        setExperienceCounts(profileCounts)
        setFields(mapFormFields(formFields, profileSources, mappingRecord, hostname))
      })
      .catch((error) => {
        if (mounted) messageApi.error(error instanceof Error ? error.message : '读取网页表单失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [messageApi, url])

  async function fillFocused(sourceKey: string) {
    const source = sources.find((item) => item.key === sourceKey)
    if (!source) return
    try {
      const result = unwrap(await window.jobflow.browser.fillFocusedField({ value: source.value }))
      if (!result.filled) throw new Error('请先在网页中选中可填写的输入框')
      messageApi.success(`${source.label}已填写`)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '无法填写当前网页字段')
    }
  }

  async function fillMapped() {
    if (!url || filling.current) return
    filling.current = true
    setReport(null)
    try {
      const formFields = unwrap(
        await window.jobflow.browser.inspectForm(experienceCounts),
      ) as BrowserFormField[]
      const currentFields = mapFormFields(formFields, sources, savedMappings, new URL(url).hostname, fields)
      setFields(currentFields)
      const needsConfirmation = currentFields.some(
        (field) =>
          field.sourceKey && field.confidence >= 0.6 && field.confidence < 0.85 && !field.selectionTouched,
      )
      if (needsConfirmation) {
        filling.current = false
        Modal.confirm({
          title: '确认中等置信度字段',
          content:
            '部分字段匹配需要确认。继续后会填写高置信度字段和这些候选字段；你也可以先在列表中修改映射。',
          okText: '确认填写',
          cancelText: '检查映射',
          onOk: () => fillSelectedFields(currentFields, true),
        })
        return
      }
      await fillSelectedFields(currentFields)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '资料填写失败')
    } finally {
      filling.current = false
    }
  }

  async function fillSelectedFields(currentFields: AssistedField[], confirmMedium = false) {
    if (!url) return
    const selected = currentFields.flatMap((field) => {
      const allowed = field.selected || (confirmMedium && field.confidence >= 0.6 && field.confidence < 0.85)
      if (!allowed || !field.sourceKey) return []
      const source = sources.find((item) => item.key === field.sourceKey)
      if (field.kind === 'file')
        return source?.kind === 'file' && source.resumeId ? [{ field, source, value: source.value }] : []
      if (source?.kind === 'file') return []
      const value = source ? formatAutofillValue(source.value, field.type) : ''
      if (!source || !value) return []
      return [{ field, source, value }]
    })
    if (!selected.length) {
      setReport({
        filled: 0,
        uploaded: 0,
        selected: 0,
        unmatched: currentFields.filter((field) => !field.sourceKey).length,
        failed: 0,
      })
      messageApi.warning('没有可填写的已确认字段；请先扫描并修正字段匹配')
      return
    }
    filling.current = true
    try {
      const fileFields = selected.filter(({ field }) => field.kind === 'file')
      const regularFields = selected.filter(({ field }) => field.kind !== 'file')
      let uploaded = 0
      for (const { field, source } of fileFields) {
        if (!source.resumeId) continue
        const resume = unwrap(await window.jobflow.resumes.readPdf({ id: source.resumeId }))
        unwrap(
          await window.jobflow.browser.uploadResume({
            index: field.index,
            signature: field.signature,
            fileName: resume.name,
            base64: resume.base64,
          }),
        )
        uploaded++
      }
      const result = unwrap(
        await window.jobflow.browser.fillProfileFields({
          fields: regularFields.map(({ field, value }) => ({
            index: field.index,
            indices: field.indices,
            signature: field.signature,
            value,
            kind: field.kind,
            options: field.options,
          })),
        }),
      )
      const unmatched = currentFields.filter((field) => !field.sourceKey).length
      const completed = result.filled + uploaded
      setReport({
        filled: result.filled,
        uploaded,
        selected: selected.length,
        unmatched,
        failed: Math.max(0, selected.length - completed),
      })
      if (completed === 0) messageApi.warning('没有字段填写成功；请查看匹配原因和未识别字段')
      else messageApi.success(`已填写 ${result.filled} 项并选择 ${uploaded} 份简历，请检查后手动提交`)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '资料填写失败')
    } finally {
      filling.current = false
    }
  }

  async function saveMapping(field: AssistedField, sourceKey?: string) {
    if (!url || !sourceKey) return
    try {
      await window.jobflow.browser
        .saveAutofillMapping({
          hostname: new URL(url).hostname,
          signature: field.signature,
          sourceKey,
        })
        .then(unwrap)
      setSavedMappings((current) => ({ ...current, [field.signature]: sourceKey }))
      messageApi.success('已记住此网站的字段映射')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '无法保存字段映射')
    }
  }

  useEffect(() => {
    if (fillRequest > 0) setFillPending(true)
  }, [fillRequest])
  useEffect(() => {
    if (!fillPending || loading) return
    setFillPending(false)
    void fillMapped()
    // Run a toolbar-triggered request once profile data and the browser page are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillPending, loading])

  const manualFillSources = sources.filter((source) => source.kind !== 'file')
  const availableProfileFields = sources.map((source) => ({ value: source.key, label: source.label }))
  const matchedCount = fields.filter((field) => field.sourceKey).length

  return (
    <section className="browser-profile-assistant" aria-label="字段扫描与资料匹配">
      {contextHolder}
      {!embedded && (
        <div className="browser-profile-assistant-heading">
          <Text strong>字段扫描与资料匹配</Text>
          <Button type="link" size="small" aria-label="收起字段匹配" onClick={onClose}>
            收起
          </Button>
        </div>
      )}
      <Alert type="info" showIcon message="高置信度自动填写；中低置信度需检查。不会触发网页提交。" />
      {loading ? (
        <div className="browser-autofill-loading">
          <Spin />
          <Text type="secondary">正在扫描网页字段…</Text>
        </div>
      ) : (
        <>
          <div className="browser-autofill-summary">
            <Text strong>
              字段匹配 {matchedCount}/{fields.length}
            </Text>
            <Button size="small" loading={fillPending} onClick={() => void fillMapped()}>
              重新扫描并填写
            </Button>
          </div>
          {report && (
            <Alert
              type={report.failed || report.unmatched ? 'warning' : 'success'}
              showIcon
              message={`成功 ${report.filled + report.uploaded} · 未填写 ${report.failed} · 未识别 ${report.unmatched}`}
            />
          )}
          <Text type="secondary" className="browser-field-hint">
            手动填写字段：先在网页中点选输入框，再点这里的字段标签。自动匹配不准时，可在下方修改并记住规则：
          </Text>
          <div className="browser-profile-chips">
            {manualFillSources.map((source) => (
              <Button
                key={source.key}
                size="small"
                className="browser-profile-chip"
                title={`${source.label}：${source.value}`}
                onClick={() => void fillFocused(source.key)}
              >
                {source.label}
              </Button>
            ))}
          </div>
          <details className="browser-form-mappings" open>
            <summary>网页字段与个人资料</summary>
            {fields.length ? (
              <List
                size="small"
                dataSource={fields}
                renderItem={(field, index) => {
                  const confidence = confidenceLabel(field.confidence)
                  return (
                    <List.Item className="browser-form-mapping-row">
                      <Checkbox
                        checked={field.selected}
                        disabled={!field.sourceKey}
                        aria-label={`确认匹配：${field.label || `表单字段 ${field.index + 1}`}`}
                        onChange={(event) =>
                          setFields((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    selected: event.target.checked,
                                    selectionTouched: true,
                                    manual: true,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <div className="browser-autofill-field">
                        <Text strong title={field.label}>
                          {field.label || `表单字段 ${field.index + 1}`}
                        </Text>
                        <Text type="secondary">
                          {[field.group, field.context, field.kind ?? field.type].filter(Boolean).join(' · ')}
                        </Text>
                        <span className="browser-field-match-evidence">
                          <Tag color={confidence.color}>{confidence.text}</Tag>
                          {field.evidence}
                        </span>
                      </div>
                      <Select
                        allowClear
                        size="small"
                        showSearch
                        optionFilterProp="label"
                        aria-label={`匹配资料：${field.label || `表单字段 ${field.index + 1}`}`}
                        value={field.sourceKey}
                        placeholder="选择资料来源"
                        options={availableProfileFields}
                        onChange={(sourceKey?: string) => {
                          setFields((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    sourceKey,
                                    selected: Boolean(sourceKey),
                                    manual: true,
                                    selectionTouched: true,
                                    confidence: sourceKey ? 1 : 0,
                                    evidence: sourceKey ? '用户确认的字段映射' : '未识别',
                                  }
                                : item,
                            ),
                          )
                          if (sourceKey) void saveMapping(field, sourceKey)
                        }}
                      />
                    </List.Item>
                  )
                }}
              />
            ) : (
              <Text type="secondary">当前网页未发现可填写的表单控件</Text>
            )}
          </details>
          <Text type="secondary" className="browser-unmatched-count">
            未识别字段：{fields.filter((field) => !field.sourceKey).length}
          </Text>
        </>
      )}
    </section>
  )
}
