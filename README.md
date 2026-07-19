# 地球 Online

地球 Online 是一个手机优先、本地离线的人生游戏 PWA。它把现实行动即时转换为经验、金币和属性成长，但 14 天试运行的核心指标始终是最多三项关键行为的坚持率。

V2.4.0 采用“现代冒险日志”界面：今天页以三项关键行动为核心，手机端提供紧凑导航和即时成长反馈，桌面端使用任务主栏与旅者状态侧栏。计分、IndexedDB 表和 schema 4 备份结构保持不变。

在线地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/](https://zhuyong1297-dev.github.io/life-rpg-pwa/)

手机预览地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/preview/](https://zhuyong1297-dev.github.io/life-rpg-pwa/preview/)

## 本地运行

```bash
pnpm install
pnpm dev
```

需要在本机检查预览环境时运行 `pnpm dev:preview`。预览环境使用独立数据库，不会读取或修改正式版数据。

生产验证：

```bash
pnpm test
pnpm build
pnpm test:e2e
pnpm privacy:scan
```

## 数据与隐私

- IndexedDB 是唯一事实来源，不需要账号或后端。
- JSON 用于完整备份和恢复，Markdown 账本用于阅读归档。
- 公开仓库只包含通用代码与人物素材，不包含个人活动、账本或迁移文件。
- `.private/` 只用于本机迁移验收，已被 Git 忽略。

## 部署

`main` 是正式版来源，`ui-redesign` 是手机预览来源。任一分支推送后，GitHub Actions 会把正式版部署到 `/life-rpg-pwa/`，把预览版部署到 `/life-rpg-pwa/preview/`。两个入口使用不同的 IndexedDB、manifest 和 Service Worker 范围。
