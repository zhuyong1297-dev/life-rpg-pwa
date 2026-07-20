# 地球 Online

地球 Online 是一个手机优先、本地离线的个人成长教练。它用经验、金币和属性提供即时反馈，再通过 28 天赛季、每周复盘和透明建议判断现实行动是否真的有效。

正式入口当前运行 V3.2.0：同一时间一个 28 天成长赛季、本地建议型教练和个人策略库。正式数据与预览数据继续完全隔离，现有正式 IndexedDB 会原位增加赛季表，不会清空活动或成长记录。

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

- IndexedDB 七张表是唯一事实来源，不需要账号或后端。
- JSON 用于完整备份和恢复，Markdown 账本用于阅读归档。
- 公开仓库只包含通用代码与人物素材，不包含个人活动、账本或迁移文件。
- `.private/` 只用于本机迁移验收，已被 Git 忽略。

## 部署

`main` 是正式版来源，`ui-redesign` 是手机预览来源。任一分支推送后，GitHub Actions 会把正式版部署到 `/life-rpg-pwa/`，把预览版部署到 `/life-rpg-pwa/preview/`。两个入口使用不同的 IndexedDB、manifest 和 Service Worker 范围。
