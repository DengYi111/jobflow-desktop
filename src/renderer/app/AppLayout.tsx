import { Layout, Typography } from 'antd'
import { Outlet, useLocation } from 'react-router-dom'
import { Navigation } from './Navigation'

const { Sider, Content } = Layout

export function AppLayout() {
  const browserMode = useLocation().pathname === '/browser'

  return (
    <Layout className={`jobflow-layout${browserMode ? ' browser-mode' : ''}`}>
      <Sider
        className="jobflow-sider"
        width={240}
        theme="light"
        collapsed={browserMode}
        trigger={null}
        collapsedWidth={60}
      >
        <div className="brand-block">
          <img className="brand-mark" src="/jobflow-icon.svg" alt="" aria-hidden="true" />
          <div>
            <Typography.Title level={4}>JobFlow</Typography.Title>
            <Typography.Text type="secondary">秋招求职工作台</Typography.Text>
          </div>
        </div>
        <Navigation />
        <div className="sider-footer">
          <span className="status-dot" /> 本地数据已就绪
        </div>
      </Sider>
      <Layout>
        <Content className="jobflow-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
