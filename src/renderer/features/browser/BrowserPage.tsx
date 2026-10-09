import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  RobotOutlined,
  ReloadOutlined,
  SearchOutlined,
  StarOutlined,
} from '@ant-design/icons'
import { SubmissionDialog } from '../jobs/StageSelect'
import { useNavigate } from 'react-router-dom'
import type {
  BrowserPageCapture,
  BrowserState,
  BrowserTab,
  CompanySummary,
} from '../../../shared/contracts/api'
import './browser-page.css'
import { BrowserCaptureDialog, type CaptureFields } from './BrowserCaptureDialog'
import { BrowserAssistantPanel } from './BrowserAssistantPanel'

const { Text } = Typography
type Site = {
  id: string
  companyId: string | null
  companyName?: string
  name: string
  url: string
  kind: 'COMPANY' | 'CAREERS'
}
type Visit = { id: string; url: string; title: string; visitedAt: string }
type SiteFields = { name: string; companyId?: string; kind: 'COMPANY' | 'CAREERS' }
const emptyState: BrowserState = { tabs: [], activeTabId: null }
const emptyCapture: BrowserPageCapture = { title: '', url: '', text: '' }

function unwrap<T>(result: { ok: true; data: T } | { ok: false; messageZh: string }): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function BrowserPage({ initialUrl }: { initialUrl?: string }) {
  const navigateRoute = useNavigate()
  const [state, setState] = useState<BrowserState>(emptyState)
  const [sites, setSites] = useState<Site[]>([])
  const [history, setHistory] = useState<Visit[]>([])
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [address, setAddress] = useState(initialUrl ?? '')
  const [siteQuery, setSiteQuery] = useState('')
  const [savingCapture, setSavingCapture] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [siteOpen, setSiteOpen] = useState(false)
  const [fillRequest, setFillRequest] = useState(0)
  const [quickAccess, setQuickAccess] = useState<'sites' | 'history' | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [pageCapture, setPageCapture] = useState(emptyCapture)
  const [duplicateMatches, setDuplicateMatches] = useState<
    Array<{ id: string; companyName: string; title: string; city: string | null; stage: string }>
  >([])
  const [pendingCapture, setPendingCapture] = useState<{ fields: CaptureFields; allowDuplicate: boolean }>()
  const [submission, setSubmission] = useState<{ applicationId: string; open: boolean }>()
  const [siteForm] = Form.useForm<SiteFields>()
  const [messageApi, contextHolder] = message.useMessage()
  const viewportRef = useRef<HTMLDivElement>(null)
  const openedInitialUrl = useRef<string>()
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId)
  const overlayOpen =
    captureOpen ||
    siteOpen ||
    quickAccess !== null ||
    duplicateMatches.length > 0 ||
    Boolean(submission?.open)

  const loadAuxiliary = useCallback(async () => {
    try {
      const [savedSites, visits, companyList] = await Promise.all([
        window.jobflow.browser.listSites({}),
        window.jobflow.browser.listHistory({ limit: 40 }),
        window.jobflow.companies.list(),
      ])
      setSites(unwrap(savedSites) as Site[])
      setHistory(unwrap(visits) as Visit[])
      setCompanies(unwrap(companyList) as CompanySummary[])
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '浏览器资料加载失败')
    }
  }, [messageApi])

  useEffect(() => {
    let mounted = true
    const unsubscribe = window.jobflow.browser.subscribe((next) => {
      if (mounted) setState(next)
    })
    void window.jobflow.browser
      .getState()
      .then((result) => {
        if (mounted) setState(unwrap(result))
      })
      .catch((error) => messageApi.error(error.message))
    return () => {
      mounted = false
      unsubscribe()
      void window.jobflow.browser.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }, [messageApi])
  useEffect(() => {
    void loadAuxiliary()
  }, [loadAuxiliary])

  useEffect(() => {
    if (initialUrl && openedInitialUrl.current !== initialUrl) {
      openedInitialUrl.current = initialUrl
      void openTab(initialUrl)
    }
    // Deep links should open once per distinct target URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  const syncBounds = useCallback(() => {
    if (overlayOpen) {
      void window.jobflow.browser.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      return
    }
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(0, rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(window.innerWidth, rect.right)
    const bottom = Math.min(window.innerHeight, rect.bottom)
    void window.jobflow.browser.setBounds({
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    })
  }, [overlayOpen])

  useLayoutEffect(() => {
    syncBounds()
    const observer = viewportRef.current ? new ResizeObserver(syncBounds) : undefined
    if (viewportRef.current) observer?.observe(viewportRef.current)
    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
    }
  }, [syncBounds, state.activeTabId])

  useEffect(() => {
    setAddress(activeTab?.url ?? '')
  }, [activeTab?.id, activeTab?.url])

  async function openTab(value: string) {
    try {
      unwrap(await window.jobflow.browser.openTab({ value }))
      await loadAuxiliary()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '无法打开网页')
    }
  }

  async function navigate(value = address) {
    if (!activeTab) return openTab(value)
    try {
      unwrap(await window.jobflow.browser.navigate({ id: activeTab.id, value }))
      await loadAuxiliary()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '无法打开网页')
    }
  }

  async function captureCurrentPage() {
    try {
      const current = unwrap(await window.jobflow.browser.capturePage())
      setPageCapture(current)
      setCaptureOpen(true)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '当前页面无法收录')
    }
  }

  async function saveCapture(fields: CaptureFields, allowDuplicate = false) {
    const companyName = fields.companyName.trim()
    const company = companies.find(
      (item) => item.name.toLocaleLowerCase('zh-CN') === companyName.toLocaleLowerCase('zh-CN'),
    )
    try {
      setSavingCapture(true)
      const result = unwrap(
        await window.jobflow.browser.captureJob({
          ...(company ? { companyId: company.id } : {}),
          companyName,
          title: fields.title.trim(),
          city: fields.city?.trim() || null,
          jobCode: fields.jobCode?.trim() || null,
          deadline: fields.deadline?.trim() || null,
          requirements: fields.requirements?.trim() || null,
          url: pageCapture.url,
          pageTitle: pageCapture.title,
          jdText: pageCapture.text,
          allowDuplicate,
        }),
      )
      if (result.kind === 'duplicates') {
        setDuplicateMatches(result.matches as typeof duplicateMatches)
        setPendingCapture({ fields, allowDuplicate: false })
        return
      }
      setCaptureOpen(false)
      messageApi.success(fields.applied === 'applied' ? '岗位已记录为已投递' : '岗位已加入待投递')
      if (fields.applied === 'applied') setSubmission({ applicationId: result.applicationId, open: true })
      await loadAuxiliary()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '收录岗位失败')
    } finally {
      setSavingCapture(false)
    }
  }

  async function saveSite(fields: SiteFields) {
    if (!activeTab) return
    try {
      unwrap(await window.jobflow.browser.saveSite({ ...fields, url: activeTab.url }))
      setSiteOpen(false)
      siteForm.resetFields()
      messageApi.success('招聘网站已保存')
      await loadAuxiliary()
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '保存招聘网站失败')
    }
  }

  async function removeSite(id: string) {
    try {
      unwrap(await window.jobflow.browser.deleteSite({ id }))
      await loadAuxiliary()
      messageApi.success('已移除收藏')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '移除收藏失败')
    }
  }

  return (
    <div className="page browser-page">
      {contextHolder}
      <header className="page-heading browser-page-heading">
        <div>
          <Text className="eyebrow">招聘工作台</Text>
          <Typography.Title level={3}>投递浏览器</Typography.Title>
        </div>
      </header>
      <Card
        className="browser-shell"
        styles={{ body: { padding: 8, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
      >
        <div className="browser-toolbar">
          <Space className="browser-navigation-controls" size={6}>
            <Button
              aria-label="后退"
              icon={<ArrowLeftOutlined />}
              disabled={!activeTab?.canGoBack}
              onClick={() => void window.jobflow.browser.back()}
            />
            <Button
              aria-label="前进"
              icon={<ArrowRightOutlined />}
              disabled={!activeTab?.canGoForward}
              onClick={() => void window.jobflow.browser.forward()}
            />
            <Button
              aria-label="刷新"
              icon={<ReloadOutlined />}
              onClick={() => void window.jobflow.browser.reload()}
            />
            <Input.Search
              aria-label="搜索公司、招聘官网或输入网址"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onSearch={() => void navigate()}
              enterButton={<SearchOutlined />}
              className="browser-address"
              placeholder="公司、招聘官网或 HTTPS 网址"
            />
          </Space>
          <Space className="browser-quick-actions" size={6}>
            <Button
              aria-label="收藏当前招聘官网"
              title="收藏当前招聘官网"
              icon={<StarOutlined />}
              disabled={!activeTab}
              onClick={() => {
                siteForm.setFieldsValue({ name: activeTab?.title || '', kind: 'CAREERS' })
                setSiteOpen(true)
              }}
            />
            <Button
              aria-label="已保存网站"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                setSiteQuery('')
                setQuickAccess('sites')
              }}
            >
              已保存网站
            </Button>
            <Button
              aria-label="浏览历史记录"
              icon={<ClockCircleOutlined />}
              onClick={() => setQuickAccess('history')}
            >
              历史
            </Button>
            <Button
              aria-label="切换投递助手"
              type={assistantOpen ? 'primary' : 'default'}
              icon={<RobotOutlined />}
              onClick={() => setAssistantOpen((open) => !open)}
            >
              投递助手
            </Button>
          </Space>
        </div>
        <div className="browser-tabs" role="tablist">
          {state.tabs.map((tab: BrowserTab) => (
            <div
              key={tab.id}
              className={`browser-tab ${tab.id === state.activeTabId ? 'active' : ''}`}
              role="tab"
              aria-selected={tab.id === state.activeTabId}
              tabIndex={0}
              onClick={() =>
                void window.jobflow.browser
                  .activateTab({ id: tab.id })
                  .then(unwrap)
                  .catch((error) => messageApi.error(error.message))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ')
                  void window.jobflow.browser
                    .activateTab({ id: tab.id })
                    .then(unwrap)
                    .catch((error) => messageApi.error(error.message))
              }}
            >
              <span>
                {tab.loading && <Spin size="small" />} {tab.title || '新标签页'}
              </span>
              <button
                type="button"
                aria-label="关闭标签页"
                className="browser-tab-close"
                onClick={(event) => {
                  event.stopPropagation()
                  void window.jobflow.browser.closeTab({ id: tab.id })
                }}
              >
                ×
              </button>
            </div>
          ))}
          <Button
            type="text"
            aria-label="新建标签页"
            icon={<PlusOutlined />}
            onClick={() => void openTab('https://www.bing.com/')}
          />
        </div>
        {activeTab?.error && <Alert type="warning" showIcon message={activeTab.error} />}
        <div className={`browser-workspace${assistantOpen ? ' browser-workspace--assistant-open' : ''}`}>
          <div ref={viewportRef} className="browser-viewport" aria-label="招聘网页浏览区域">
            {!activeTab && <Empty description="输入公司名称或招聘官网开始浏览" />}
          </div>
          {assistantOpen && activeTab && (
            <BrowserAssistantPanel
              url={activeTab.url}
              fillRequest={fillRequest}
              onFill={() => setFillRequest((current) => current + 1)}
              onCapture={() => void captureCurrentPage()}
              onClose={() => setAssistantOpen(false)}
            />
          )}
        </div>
      </Card>

      <BrowserCaptureDialog
        open={captureOpen}
        page={pageCapture}
        companies={companies}
        sites={sites}
        saving={savingCapture}
        onCancel={() => setCaptureOpen(false)}
        onSave={(fields) => void saveCapture(fields)}
      />

      <Modal
        title={quickAccess === 'sites' ? '已保存的网站' : '最近访问'}
        open={quickAccess !== null}
        onCancel={() => setQuickAccess(null)}
        footer={null}
        width={600}
        destroyOnHidden
      >
        {quickAccess === 'sites' ? (
          <>
            <Input.Search
              aria-label="搜索已保存的网站"
              value={siteQuery}
              onChange={(event) => setSiteQuery(event.target.value)}
              placeholder="搜索公司或招聘网站"
              allowClear
            />
            <List
              className="browser-access-list"
              dataSource={sites.filter((site) =>
                `${site.name} ${site.companyName ?? ''}`
                  .toLocaleLowerCase()
                  .includes(siteQuery.toLocaleLowerCase()),
              )}
              locale={{ emptyText: '还没有收藏的网站' }}
              renderItem={(site) => (
                <List.Item
                  actions={[
                    <Button
                      key="open"
                      type="link"
                      onClick={() => {
                        setQuickAccess(null)
                        void openTab(site.url)
                      }}
                    >
                      打开
                    </Button>,
                    <Button key="remove" type="link" danger onClick={() => void removeSite(site.id)}>
                      移除
                    </Button>,
                  ]}
                >
                  <List.Item.Meta title={site.name} description={site.companyName || site.url} />
                </List.Item>
              )}
            />
          </>
        ) : (
          <>
            <div className="browser-access-heading">
              <Text type="secondary">最近访问的网址保存在本机</Text>
              <Button type="link" onClick={() => void loadAuxiliary()}>
                刷新
              </Button>
            </div>
            <List
              className="browser-access-list"
              dataSource={history}
              locale={{ emptyText: '暂无访问记录' }}
              renderItem={(visit) => (
                <List.Item>
                  <button
                    className="browser-history-link"
                    title={visit.url}
                    onClick={() => {
                      setQuickAccess(null)
                      void openTab(visit.url)
                    }}
                  >
                    <strong>{visit.title || visit.url}</strong>
                    <span>{visit.url}</span>
                  </button>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>

      <Modal
        title="收藏招聘网站"
        open={siteOpen}
        onCancel={() => setSiteOpen(false)}
        onOk={() => void siteForm.submit()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {activeTab && (
          <Text type="secondary" className="browser-site-url">
            {activeTab.url}
          </Text>
        )}
        <Form form={siteForm} layout="vertical" onFinish={saveSite}>
          <Form.Item name="name" label="显示名称" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="例如：小米校招官网" />
          </Form.Item>
          <Form.Item name="companyId" label="关联公司">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              placeholder="可选，选择公司"
            />
          </Form.Item>
          <Form.Item name="kind" label="网站类型" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { value: 'CAREERS', label: '招聘官网' },
                { value: 'COMPANY', label: '公司官网' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发现相似岗位"
        open={duplicateMatches.length > 0}
        onCancel={() => {
          setDuplicateMatches([])
          setPendingCapture(undefined)
        }}
        onOk={() => {
          const pending = pendingCapture
          setDuplicateMatches([])
          setPendingCapture(undefined)
          if (pending) void saveCapture(pending.fields, true)
        }}
        okText="仍然新增"
        cancelText="返回修改"
      >
        <Text>可能已经收录了相同公司或招聘链接。请检查已有记录后再决定是否重复添加。</Text>
        <List
          dataSource={duplicateMatches}
          renderItem={(match) => (
            <List.Item>
              <Button type="link" onClick={() => navigateRoute(`/jobs/${match.id}`)}>
                {match.companyName} · {match.title}
              </Button>
            </List.Item>
          )}
        />
      </Modal>
      {submission && (
        <SubmissionDialog
          id={submission.applicationId}
          open={submission.open}
          onOpenChange={(open) =>
            setSubmission((current) => (open && current ? { ...current, open } : undefined))
          }
          showTrigger={false}
          onSubmitted={() => {
            setSubmission(undefined)
            return true
          }}
        />
      )}
    </div>
  )
}
