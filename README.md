# JobFlow 秋招求职工作台

[**直接下载 Windows 安装程序（v0.1.0）**](https://github.com/DengYi111/jobflow-desktop/releases/download/v0.1.0/JobFlow-Windows-0.1.0-Setup.exe) · [SHA-256 校验文件](https://github.com/DengYi111/jobflow-desktop/releases/download/v0.1.0/JobFlow-Windows-0.1.0-Setup.exe.sha256)

> 仅对获准访问此私有仓库的账号开放。适用于 Windows 10/11 x64；安装包未进行代码签名，Windows 可能显示未知发布者提示。

JobFlow 是一款面向个人求职流程的 Windows 桌面应用。它把公司与岗位、投递进度、面试日程与题库、个人资料和简历集中保存在本机，内置招聘网站浏览器，并提供可人工检查的一键资料填写。

应用不会替用户提交招聘网站表单。自动填写只负责将资料写入网页字段，最终提交由用户检查后自行完成。

## 功能

- 维护公司、岗位、投递链接、截止日期、备注及流程时间线。
- 通过岗位看板和首页行动栏跟进待投递、测评、笔试及面试。
- 管理面试日程、轮次、复盘和按公司/岗位关联的面试题库。
- 管理个人资料、教育/实习/项目经历及简历版本。
- 在内置招聘浏览器中访问和收藏招聘网站、收录岗位、匹配资料并辅助填写。
- 导出完整本地备份或 CSV，并从经过校验的备份恢复。

## 技术栈

- Electron、React、TypeScript、Vite
- SQLite、Drizzle ORM
- Ant Design、Zustand、Zod
- pnpm、Vitest、ESLint、Prettier

依赖版本由 `package.json` 和 `pnpm-lock.yaml` 固定。界面使用中文；应用名称、网址、代码和部分第三方组件原有术语会保留其标准写法。

## 开发环境

- Windows 10 或 Windows 11（桌面打包使用 NSIS）。
- Node.js 24.19 或更新的 24.x 版本。
- pnpm 11.19.0（可通过 Corepack 启用）。

```powershell
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run dev
```

## 检查与构建

```powershell
pnpm run format:check
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run verify
```

生成 Windows 安装程序：

```powershell
pnpm run dist:win
```

安装包位于 `release/`。安装时可以选择目录。正式版默认把本地数据保存在所选安装目录的上一级 `Data` 文件夹中；例如安装到 `E:\JobFlow\App` 时，数据目录为 `E:\JobFlow\Data`。卸载程序会保留该目录。开发模式的数据目录固定为 `E:\JobFlow\Data`。

## 数据与隐私

- 求职记录、简历和浏览器会话保存在本地，不会由 JobFlow 自动上传。
- 个人敏感字段由当前 Windows 账户保护；在其他 Windows 账户或设备上需要通过应用备份/恢复流程迁移资料。
- 招聘网站的登录状态保存在本机浏览器会话中。不要把真实数据目录、数据库、简历、安装器、浏览器缓存或登录状态提交到 Git。
- 自动填写可能因招聘网站页面结构而无法识别全部字段。请逐项检查填写结果，再由本人提交。
- 导出备份包含个人求职数据及简历文件，应保存在可信位置。
- 单元和集成测试使用隔离的内存数据库或临时目录；不要把正式数据目录用于开发测试。

## 项目结构

```text
electron/       Electron 主进程、浏览器控制、安全策略与启动装配
src/main/       仓储、业务服务、数据库访问和日志
src/renderer/   React 页面及可复用界面组件
src/shared/     主进程与界面共用的类型、常量和数据校验
drizzle/        数据库 schema 迁移
tests/          单元、集成和性能测试
scripts/        Windows 安装及应用图标构建脚本
public/         应用图标、PDF 阅读资源和第三方许可
```

新增数据库字段时应通过 `drizzle/` 迁移升级，不能要求用户删除已有数据库。模块边界和本地数据安全约定见 `docs/` 下的设计文档。

## 许可

JobFlow 使用 MIT 许可，详见 [LICENSE](LICENSE)。第三方依赖、字体及 PDF 阅读资源的许可见 `public/licenses/` 和各自上游项目说明。
