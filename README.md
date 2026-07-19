# 地球 Online

地球 Online 是一个手机优先、本地离线的人生游戏 PWA。它把现实行动即时转换为经验、金币和属性成长，但 14 天试运行的核心指标始终是最多三项关键行为的坚持率。

V2.2.0 支持完整编辑、归档与恢复习惯。已完成按钮可随时打开完成记录，并通过二次确认取消今天的误触完成；所有修正仍保留可解释流水。

在线地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/](https://zhuyong1297-dev.github.io/life-rpg-pwa/)

## 本地运行

```bash
pnpm install
pnpm dev
```

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

`main` 分支通过 GitHub Actions 构建并部署到 GitHub Pages，站点基础路径为 `/life-rpg-pwa/`。
