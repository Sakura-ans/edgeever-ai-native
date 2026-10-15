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

可通过 `--user-data-dir=<绝对路径>` 选择独立数据目录与单实例锁。自动测试会
核对实际生效路径，不再将仅修改 `APPDATA` 视为可靠的 Windows 工作区隔离。

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
bun scripts/test-personal.mjs
bun run typecheck
bun run typecheck:mobile
EDGE_EVER_DESKTOP_BUILD=1 bun run build:web
# 已启动 dev:web 时，可指定环境现有 Chromium：
CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-personal-mind.mjs
```

浏览器测试使用真实本地仓库、mock Electron bridge 和合成数据，覆盖创建/编辑、
画布/大纲、刷新、撤销重做、提案拒绝/确认/回滚及页面异常。它不能替代 Electron
IPC、Windows DPAPI、安装或首次离线启动测试。另有
`scripts/verify-personal-package.mjs <解包后的程序>` 检查真实 Electron bridge、
创建/保存/重载及包内 SDK 程序，已在 Linux 虚拟显示环境通过且未调用模型。
Windows 证据工作流新增真实 NSIS 静默安装，在首次打开全新工作区前阻断应用与 SDK
出站网络，并对安装后的程序执行 `verify-personal-acceptance.mjs`。每轮 Actions
证据产物包含实际截图、逐项结果、安装信息与测试日志，具体状态以该轮产物为准。
AI 提案由调试器向真实存储注入，后续确认/拒绝走真实 IPC 和文件写入，不调用模型。
文件选择与安全存储失败采用故障注入；Windows 加密成功路径使用真实 safeStorage
和合成密钥。基线 49 项测试与当前扩展套件分别复现并记录。

真实 DeepSeek 仍需要安全密钥输入方式，以及明确的小额预算和数据范围批准。
本轮工具没有可用的 Vault 或安全密钥输入，不要在聊天或仓库提交密钥；应用设置
是现有本地配置入口。CI 不能覆盖所有实体 Windows 硬件和系统组合。
旧版迁移/升级没有实现或
验证，新旧应用并行安装。断电耐久性、无障碍及大图长时间性能尚未验证。

## 可读预览与可编辑项目示例

预览以中文展示新增、删除、重命名、移动及其他调整的数量，并给出完整节点路径与
前后对照。同名兄弟主题用序号区分；删除子树逐项列出受影响主题。位置、尺寸、
排列和连接线标识变化均会提示，可展开完整大纲核对，不展示原始 JSON。
空、非法或无实际修改的提案由存储层拒绝；已知过期提案禁止确认，确认时仍执行
权威版本检查。请求两分钟后通过 SDK 中止控制器取消；取消与超时使用 mock 验证，
尚未通过真实服务验证。

固定端点为 `https://api.deepseek.com/anthropic`，非秘密默认模型为
`deepseek-flash`，仍可修改。此默认值按用户要求设置，不代表已完成真实兼容性或
计费验证。

通过“导入备份为副本”打开 `examples/edgeever-mind-project.json`。这是包含 28 个
主题的原生可编辑备份，由 `scripts/create-personal-project-map.mjs` 程序生成，
并非 DeepSeek 生成，明确标记已实现能力和待验项目。“适应画布”可显示全图。
原生验收脚本实际导入、编辑、撤销并重启恢复，再保存截图；导图、报告和截图均放入
小型 Actions 证据附件。当前单元套件新增可读差异、节点数/深度/名称边界、循环移动、
损坏/不支持版本导入、无变更拒绝、重启回滚及超时检查；不声称覆盖全部攻击输入或
大图性能。

## 双外壳与导图样式持久化

顶部外观按钮可在温暖纸感与深色工作室之间直接切换。外壳和左侧面板显隐偏好
在本机保存，与导图数据独立。右侧面板可切换属性、主题、AI 或收起；Windows
窗口最小宽度为 640 像素。字体均使用本机系统字体。

主题库保留原有 11 配色和 13 结构，新增 `parchment`（纸间）与 `studio`（工作室）。
所有历史 ID 和别名映射不变，旧 `paper` 仍映射到 `brand`。配色卡使用真实 X6
小导图，结构缩略图复用原编辑器组件；根、主、叶节点视觉与七种布局家族均复用
共享导图模块。预览只有点击应用才保存，取消或关闭面板不写入。切换结构先确认
重排，并作为一步撤销记录；外壳和配色变化不会修改已有坐标。

JSON 校验现保留并验证文档及历史中的 theme/structure。没有样式的旧文档仍可读。
备份导入导出、前一状态恢复、重启、撤销重做与 AI 确认均保留这些字段。即使模型
或 mock 试图替换样式，AI 提案也继承当前导图的风格。回滚可撤销此次功能提交；
回滚前应导出带样式的工作区，因为旧版保存时会丢弃样式元数据。

`node scripts/verify-personal-styles.mjs` 使用真实存储加 mock 桥，在 2 倍 DPI 浏览器
中验收。相同场景也在 Windows 已安装应用执行，覆盖全部预设、布局撤销、预览
取消、外壳重启、侧栏折叠、键盘和窄窗。Windows 流程另安装固定的上次成功 NSIS
产物（run 38723757542，提交 3fc3c244），创建真实旧版工作区，再覆盖安装当前版
并验证数据和历史连续性。独立的新工作区验收仍在出站防火墙启用后执行。每轮
Actions 产物才是通过与否的依据，新增测试不等于已经执行通过。测试不调用真实模型。
