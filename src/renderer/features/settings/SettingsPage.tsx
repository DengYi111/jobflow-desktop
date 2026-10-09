import {
  CheckCircleOutlined,
  FolderOpenOutlined,
  SafetyOutlined,
  SettingOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Divider, Modal, Space, Spin, Switch, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import type { ApiResult, SettingsInfo } from '../../../shared/contracts/api'

const { Title, Text, Paragraph } = Typography

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.messageZh)
  return result.data
}

export function SettingsPage() {
  const [info, setInfo] = useState<SettingsInfo>()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [savingNotification, setSavingNotification] = useState(false)
  const [busyAction, setBusyAction] = useState<string>()
  const [restoreStaged, setRestoreStaged] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextInfo, enabled] = await Promise.all([
        window.jobflow.settings.getInfo().then(unwrap),
        window.jobflow.dashboard.getNotificationsEnabled().then(unwrap),
      ])
      setInfo(nextInfo)
      setNotificationsEnabled(enabled)
      setLoadError(undefined)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '设置加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    if (busyAction) return
    setBusyAction(key)
    try {
      await action()
      if (success) messageApi.success(success)
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '操作失败，请重试')
    } finally {
      setBusyAction(undefined)
    }
  }

  const changeNotifications = async (enabled: boolean) => {
    setSavingNotification(true)
    try {
      unwrap(await window.jobflow.dashboard.setNotificationsEnabled({ enabled }))
      setNotificationsEnabled(enabled)
      messageApi.success(enabled ? '桌面通知已开启' : '桌面通知已关闭，逐项提醒设置已保留')
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '通知设置保存失败')
    } finally {
      setSavingNotification(false)
    }
  }

  const exportBackup = () =>
    runAction(
      'backup',
      async () => {
        const result = unwrap(await window.jobflow.backup.exportFromDialog())
        if (!result.canceled) messageApi.success('完整备份已导出')
      },
      '',
    )

  const exportCsv = () =>
    runAction(
      'csv',
      async () => {
        const result = unwrap(await window.jobflow.backup.exportCsvFromDialog())
        if (!result.canceled) messageApi.success('CSV 数据已导出')
      },
      '',
    )

  const chooseRestore = () =>
    Modal.confirm({
      title: '从备份恢复数据？',
      content:
        '恢复会替换当前岗位、公司、流程记录和简历文件。应用会先制作当前数据的回滚备份；浏览器登录状态不会恢复。',
      okText: '选择备份并继续',
      cancelText: '取消',
      onOk: async () =>
        runAction(
          'restore',
          async () => {
            const result = unwrap(await window.jobflow.backup.restoreFromDialog())
            if (result.canceled) return
            if (result.staged) {
              setRestoreStaged(true)
              messageApi.success('备份校验完成；重启后应用恢复数据')
            }
          },
          '',
        ),
    })

  const confirmClearHistory = () =>
    Modal.confirm({
      title: '清空浏览历史？',
      content: '只会清除招聘网站访问记录，不会删除岗位、公司、收藏网站或简历。',
      okText: '清空历史',
      cancelText: '取消',
      onOk: () =>
        runAction(
          'history',
          async () => {
            unwrap(await window.jobflow.browser.clearHistory())
          },
          '访问历史已清空',
        ),
    })

  const confirmClearSession = () =>
    Modal.confirm({
      title: '清除招聘网站登录状态与缓存？',
      content:
        '这会退出招聘网站并清理浏览器缓存；你之后需要重新登录。岗位、公司、收藏网站、访问历史和简历会保留。',
      okText: '清除登录状态',
      cancelText: '取消',
      onOk: () =>
        runAction(
          'session',
          async () => {
            unwrap(await window.jobflow.browser.clearSession())
          },
          '招聘网站登录状态与缓存已清除',
        ),
    })

  return (
    <div className="page settings-page">
      {contextHolder}
      <header className="page-heading">
        <div>
          <Text className="eyebrow">秋招求职工作台</Text>
          <Title level={2}>设置</Title>
          <Text type="secondary">管理本地数据、桌面提醒和浏览器隐私。</Text>
        </div>
      </header>
      {loading ? (
        <div className="settings-loading" role="status">
          <Spin description="正在读取设置…" />
        </div>
      ) : (
        <>
          {loadError && (
            <Alert
              className="settings-load-error"
              type="error"
              showIcon
              title="设置读取失败"
              description={loadError}
              action={
                <Button size="small" onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          )}
          <section className="settings-section" aria-labelledby="settings-data-heading">
            <div className="settings-section-heading">
              <FolderOpenOutlined />
              <div>
                <Title level={4} id="settings-data-heading">
                  数据与备份
                </Title>
                <Text type="secondary">数据保存在本机 E 盘，导出的文件由你选择保存位置。</Text>
              </div>
            </div>
            <Card className="settings-card">
              <div className="settings-data-location">
                <div>
                  <Text strong>本地数据目录</Text>
                  <Text className="settings-path">{info?.dataDirectory ?? 'E:\\JobFlow\\Data'}</Text>
                </div>
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={() =>
                    void runAction(
                      'folder',
                      async () => {
                        unwrap(await window.jobflow.settings.openDataDirectory())
                      },
                      '已打开数据文件夹',
                    )
                  }
                >
                  打开文件夹
                </Button>
              </div>
              <Divider />
              <Space wrap className="settings-actions">
                <Button
                  type="primary"
                  loading={busyAction === 'backup'}
                  disabled={Boolean(busyAction)}
                  onClick={() => void exportBackup()}
                >
                  导出完整备份
                </Button>
                <Button
                  loading={busyAction === 'restore'}
                  disabled={Boolean(busyAction)}
                  onClick={chooseRestore}
                >
                  从备份恢复
                </Button>
                <Button
                  loading={busyAction === 'csv'}
                  disabled={Boolean(busyAction)}
                  onClick={() => void exportCsv()}
                >
                  导出 CSV
                </Button>
              </Space>
              <Paragraph className="settings-footnote" type="secondary">
                完整备份包含岗位资料和简历，并由 Windows 当前账户保护；换用其他 Windows
                账户时无法解密。不包含招聘网站登录状态、访问历史或缓存。CSV
                为便于表格查看的未加密导出，请妥善保管。
              </Paragraph>
              {restoreStaged && (
                <Alert
                  className="settings-restore-alert"
                  type="warning"
                  showIcon
                  title="恢复数据已准备好"
                  description="应用需重启才能安全替换当前数据。重启前已制作当前数据的回滚备份。"
                  action={
                    <Button
                      size="small"
                      type="primary"
                      icon={<SyncOutlined />}
                      onClick={() =>
                        void runAction(
                          'restart',
                          async () => {
                            const result = unwrap(await window.jobflow.backup.applyStagedRestoreAndRestart())
                            if (!result.applied) throw new Error(result.error ?? '恢复未能应用')
                          },
                          '恢复已应用，应用即将重启',
                        )
                      }
                    >
                      重启并应用恢复
                    </Button>
                  }
                />
              )}
            </Card>
          </section>

          <section className="settings-section" aria-labelledby="settings-privacy-heading">
            <div className="settings-section-heading">
              <SafetyOutlined />
              <div>
                <Title level={4} id="settings-privacy-heading">
                  提醒与隐私
                </Title>
                <Text type="secondary">全局关闭只暂停提醒，不会清除每条行动和面试的独立设置。</Text>
              </div>
            </div>
            <Card className="settings-card">
              <div className="settings-preference-row">
                <div>
                  <Text strong>桌面通知总开关</Text>
                  <Text type="secondary">关闭时不发送首页行动和面试的桌面提醒。</Text>
                </div>
                <Switch
                  aria-label="桌面通知总开关"
                  checked={notificationsEnabled}
                  disabled={Boolean(loadError)}
                  loading={savingNotification}
                  onChange={(enabled) => void changeNotifications(enabled)}
                />
              </div>
              <Divider />
              <div className="settings-privacy-row">
                <div>
                  <Text strong>招聘浏览器数据</Text>
                  <Text type="secondary">清理访问历史或退出招聘网站登录状态。</Text>
                </div>
                <Space wrap>
                  <Button
                    danger
                    disabled={Boolean(busyAction)}
                    loading={busyAction === 'history'}
                    onClick={confirmClearHistory}
                  >
                    清空浏览历史
                  </Button>
                  <Button
                    danger
                    disabled={Boolean(busyAction)}
                    loading={busyAction === 'session'}
                    onClick={confirmClearSession}
                  >
                    清除登录状态与缓存
                  </Button>
                </Space>
              </div>
            </Card>
          </section>

          <section className="settings-section" aria-labelledby="settings-about-heading">
            <div className="settings-section-heading">
              <SettingOutlined />
              <div>
                <Title level={4} id="settings-about-heading">
                  应用信息
                </Title>
                <Text type="secondary">JobFlow 秋招求职工作台</Text>
              </div>
            </div>
            <Card className="settings-card settings-about-card">
              <CheckCircleOutlined />
              <Text>JobFlow</Text>
              <Text type="secondary">版本 {info?.version ?? '未知'}</Text>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
