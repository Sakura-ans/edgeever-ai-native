# EdgeEver Mind（个人 Windows 预览版）

[English](personal-mind.md)

个人产品复用 React/Vite、AntV X6 与 DiagramDocument IR，通过独立 Electron
入口启动，不初始化原来的登录、账号 sidecar、云同步、官方更新、插件或 ACP
自动安装服务。本地工作台不需要服务器。原版 EdgeEver 仍可通过原有命令运行。

## 开发与打包

```sh
bun install --frozen-lockfile
# 终端 1
bun run dev:web
```

```powershell
# 终端 2
$env:EDGEEVER_MIND_DEV_URL='http://127.0.0.1:5173/personal.html'
bun run --cwd apps/desktop dev:mind
# Windows 生产打包
$env:EDGE_EVER_DESKTOP_BUILD='1'
bun run build:web
bun run --cwd apps/desktop dist:mind
```

未签名 x64 NSIS 安装器输出到 `release/mind`。个人 CI 仅生成仓库 Actions 构建
产物，不发布 Release、不部署。独立打包配置使用不同 app ID、程序名和数据目录，
没有更新源。上游同步工作流已添加本仓库排除条件，但**只有变更进入默认分支后**
才会影响定时任务；仅推送功能分支不会改变 main 上正在使用的同步配置。

## 数据与恢复

Windows 数据位于 `%APPDATA%/EdgeEverMind/maps/workspace.json`。不读取或迁移
旧 EdgeEver 账号和 SQLite 数据。首版个人工作区采用独立、校验后的 JSON 仓库，
避开 Rust SQLite 的账号绑定。写入串行执行，临时文件 flush 后原子重命名；
`workspace.previous.json` 保存上一个成功状态。读取失败不会静默创建空工作区。
此方案不保证旧 SQLite 跨版本迁移兼容。

支持导图创建/重命名/删除、节点编辑与子树删除、画布拖动、大纲选择、自动保存、
重启恢复、持久化撤销重做（每图 50 个文档状态）、JSON 备份导入导出。导入创建
副本，不覆盖原图。上限为 500 张图、每图 2,000 节点、树深度 100、工作区/备份
8 MB。输入会产生逐次撤销步骤。整图重命名和删除不属于文档撤销步骤，删除前应
导出备份。文件损坏时关闭程序并保留损坏文件，再将导出的备份或上一个状态恢复为
`workspace.json`。

## AI 权限边界

DeepSeek 端点为 `https://api.deepseek.com/anthropic`，模型标识由用户填写。
密钥仅由 Electron 主进程通过操作系统 `safeStorage` 加密保存，拒绝明文后备。
渲染进程只能查询“是否已保存”；留空保留原密钥，也可单独删除。启动不请求模型。

固定使用官方 Claude Agent SDK 0.3.300 及其原生 CLI，由 SDK 执行 Agent 循环
和流式输出。个人入口直接使用 SDK，不经过现有 ACP host：后者自动允许工具并
暴露笔记变更能力，不适合强制确认边界。本次没有重写 Agent 引擎。SDK 使用独立
临时工作/配置目录，不加载文件系统配置、技能、插件或内置工具，启用严格 MCP
配置与默认拒绝权限回调。

仅提供两个进程内 MCP 工具：`read_map` 和 `propose_map`。没有 apply、数据库、
shell 或文件工具。提案经校验后仅存在主进程内存中；只有可信渲染进程的确认 IPC
能消费提案并执行 revision 检查后的保存。过期提案失败，拒绝不写入，应用后可撤销。
重启会清除待审提案。这是 SDK 工具能力约束，不是针对不可信 SDK 二进制的 OS 沙箱。

支持完整助手消息和流式文字增量。只有显式发送后才可能通过读取工具将当前导图
传给模型。实现验证没有使用真实密钥、付费请求或真实用户数据。

## 验证与待验收项

```sh
bun test apps/desktop/src/main/personal-store.test.mjs apps/desktop/src/main/personal-ai.test.mjs apps/web/src/lib/diagram-*.test.mjs
bun run typecheck
bun run typecheck:mobile
EDGE_EVER_DESKTOP_BUILD=1 bun run build:web
# 已启动 dev:web 时，可指定环境现有 Chromium：
CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-personal-mind.mjs
```

浏览器测试使用真实本地仓库、mock Electron bridge 和合成数据，覆盖创建/编辑、
画布/大纲、刷新、撤销重做、提案拒绝/确认/回滚及页面异常。它不能替代 Electron
IPC、Windows DPAPI、安装或首次离线启动测试。Windows 必须继续验收：干净账号
安装 EXE，首次启动前断网，创建/编辑/重启/备份/恢复，凭据加密，以及安装包内 SDK
原生程序解析；真实 DeepSeek 测试须另行明确授权密钥。旧版迁移/升级没有实现或
验证，新旧应用并行安装。断电耐久性、无障碍及大图长时间性能尚未验证。
