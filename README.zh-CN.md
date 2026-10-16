# EdgeEver Mind

离线、免登录的个人导图工作台，基于 EdgeEver 的共享导图引擎。数据保存在本机 JSON 工作区。温暖纸感与深色工作室独立于导图样式；保留原 11 配色、13 结构及历史 ID，并新增 parchment/studio 配色。

## 开发与验证

使用 package.json 固定的 Bun 版本：

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build:web
bun run dev:web
bun run dev:desktop
```

Windows 安装包：`bun run build:desktop`。产物位于 `release/mind`。功能分支 CI 会真实安装旧 NSIS 包，再覆盖安装新版，另用全新用户目录验收离线启动、样式、导入导出、撤销重做与 mock AI。CI 不发布 Release、不部署。

## 产品边界

保留 `apps/web` 个人工作台、`apps/desktop` 本地存储与 Claude Agent SDK、安全密钥存储，以及 `packages/shared` 导图模型和布局。账号同步、笔记/多媒体编辑器、服务端、网站、移动端和浏览器扩展已从此个人分支删除；完整历史仍在 Git 中。旧工作区格式兼容，切勿删除用户数据目录。

AI 默认模型标识 `deepseek-flash`，仅在用户配置并主动请求时调用。测试仅使用 mock/合成凭据，不调用付费模型。预览以中文展示增删改移动，确认后写入；模型不能覆盖现有配色或结构。

## 本地字体与许可

固定 `@fontsource-variable/noto-sans-sc@5.3.0`，分发上游 index.css 的全部 101 个原始 WOFF2 分区，不按应用文本裁剪。构建复制到本地 fonts 目录，无在线字体/CDN。提供 100–900 字重和系统中文回退；字体自身字库以外的字符由系统回退。字体 OFL-1.1、项目 AGPL-3.0 及第三方声明随包保留，见 LICENSE、NOTICE。

## 验收与体积

`.github/workflows/personal-mind.yml` 生成 Windows 安装包、真实截图与 HTML 报告。`scripts/personal-size-audit.mjs` 对同配置旧/新 NSIS exe 和安装目录逐文件字节求和，报告字体成本与差值；ZIP 附件大小不能代替安装包大小。Windows CI 桌面验收不代表全部物理设备。

修复行为、复现检查与 IME/mock 边界见[十项修复对照表](docs/personal-repairs.zh-CN.md)。
