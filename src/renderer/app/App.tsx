import { lazy, Suspense } from 'react'
import { ConfigProvider, Typography, Card, theme } from 'antd'
import { RiseOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import '../../App.css'

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const JobsPage = lazy(() =>
  import('../features/jobs/JobsPage').then((module) => ({ default: module.JobsPage })),
)
const JobDetailsPage = lazy(() =>
  import('../features/jobs/JobDetailsPage').then((module) => ({ default: module.JobDetailsPage })),
)
const CompanyPage = lazy(() =>
  import('../features/jobs/CompanyPage').then((module) => ({ default: module.CompanyPage })),
)
const InterviewsPage = lazy(() =>
  import('../features/interviews/InterviewsPage').then((module) => ({ default: module.InterviewsPage })),
)
const ProfilePage = lazy(() =>
  import('../features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })),
)
const PdfPreviewPage = lazy(() =>
  import('../features/profile/PdfPreviewPage').then((module) => ({ default: module.PdfPreviewPage })),
)
const BrowserPage = lazy(() =>
  import('../features/browser/BrowserPage').then((module) => ({ default: module.BrowserPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

const { Title, Text } = Typography

function BrowserRoute() {
  const [params] = useSearchParams()
  return <BrowserPage initialUrl={params.get('url') ?? undefined} />
}

const comingSoon: Record<string, { title: string; description: string }> = {
  jobs: { title: '岗位管理', description: '集中记录公司、岗位信息与投递进度。' },
  browser: { title: '投递浏览器', description: '在可信隔离的浏览器中浏览并收录招聘页面。' },
  interviews: { title: '面试准备', description: '管理面试日程、复盘记录与个人题库。' },
  library: { title: '资料库', description: '维护个人资料、项目经历与简历版本。' },
  settings: { title: '设置', description: '管理本地数据、备份与应用偏好。' },
}

function ComingSoonPage({ section }: { section: keyof typeof comingSoon }) {
  const info = comingSoon[section]
  return (
    <div className="page coming-page">
      <Text className="eyebrow">JOBFLOW 工作台</Text>
      <Title level={2}>{info.title}</Title>
      <Text type="secondary">{info.description}</Text>
      <Card className="coming-card">
        <span className="coming-icon">
          <RiseOutlined />
        </span>
        <Title level={4}>即将开放</Title>
        <Text type="secondary">功能正在准备中，你可以先从首页开始规划求职节奏。</Text>
      </Card>
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { colorPrimary: '#4665dc', borderRadius: 12, fontFamily: '"Noto Sans SC", sans-serif' },
      }}
    >
      <HashRouter>
        <Suspense
          fallback={
            <div className="page" role="status">
              正在加载页面…
            </div>
          }
        >
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="jobs/:jobId" element={<JobDetailsPage />} />
              <Route path="companies" element={<CompanyPage />} />
              <Route path="companies/:companyId" element={<CompanyPage />} />
              <Route path="browser" element={<BrowserRoute />} />
              <Route path="interviews" element={<InterviewsPage />} />
              <Route path="library" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<ComingSoonPage section="jobs" />} />
            </Route>
            <Route path="resume-preview/:resumeId" element={<PdfPreviewPage />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ConfigProvider>
  )
}
