# 地球 Online

地球 Online 是一个手机优先、本地离线的个人成长教练。它用经验、金币和六个现实成长领域提供即时反馈，再通过 28 天赛季、每周复盘和透明建议判断现实行动是否真的有效。

当前线上正式入口与手机预览均运行 V4.2.0。V4.2.0 增加目标规划器，把现实结果拆成 1～3 项明确行为；存在当前赛季时只保存下个赛季方案，不修改当前赛季、关键行动或成长历史。正式数据与预览数据继续完全隔离。

`ui-redesign` 当前工作区是 V4.3.0 前端预览候选：采用现代田野日志设计系统，压缩今天页首屏状态，重整旅者档案、周度账本、设置清单、四步规划器和迁移长文档。确认并发布前，正式版本号、JSON schema 9 和备份 `appVersion` 仍保持 V4.2.0。

在线地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/](https://zhuyong1297-dev.github.io/life-rpg-pwa/)

正式版本：[地球 Online V4.2.0](https://github.com/zhuyong1297-dev/life-rpg-pwa/releases/tag/v4.2.0)

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
- V4.2 使用 JSON schema 9，兼容恢复 schema 1 至 8；规划草稿进入全量备份，Markdown 账本仍只用于阅读归档。
- 公开仓库只包含通用代码与人物素材，不包含个人活动、账本或迁移文件。
- `.private/` 只用于本机迁移验收，已被 Git 忽略。

## 部署

`main` 是正式版来源，`ui-redesign` 是手机预览来源。任一分支推送后，GitHub Actions 会把正式版部署到 `/life-rpg-pwa/`，把预览版部署到 `/life-rpg-pwa/preview/`。两个入口使用不同的 IndexedDB、manifest 和 Service Worker 范围。
