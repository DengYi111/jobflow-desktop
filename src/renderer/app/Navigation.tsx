import {
  AppstoreOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  HomeOutlined,
  ReadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'

const items: MenuProps['items'] = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/jobs', icon: <AppstoreOutlined />, label: '岗位' },
  { key: '/browser', icon: <FileSearchOutlined />, label: '投递浏览器' },
  { key: '/interviews', icon: <ReadOutlined />, label: '面试与题库' },
  { key: '/library', icon: <DatabaseOutlined />, label: '个人信息与简历' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
]

export function Navigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedKey = location.pathname === '/' ? '/' : `/${location.pathname.split('/')[1]}`

  return (
    <Menu
      className="jobflow-navigation"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={items}
      onClick={({ key }) => navigate(key)}
    />
  )
}
