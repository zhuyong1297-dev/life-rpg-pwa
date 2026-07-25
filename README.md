# 地球 Online

地球 Online 是一个手机优先、本地离线的个人成长教练。它用经验、金币和六个现实成长领域提供即时反馈，再通过 28 天赛季、每周复盘和透明建议判断现实行动是否真的有效。

当前线上正式版运行 V5.2.1，手机预览版为 V5.3.0。预览版把备份、恢复和 Obsidian 交换集中到独立数据中心，并允许 28 天赛季在任何一天经过二次确认后提前结项。

首页把普通习惯拆为“每日行动”和“本周进度”。每周目标使用紧凑里程碑轨道；组合目标先选择活动预设时长再记录，打开选择窗口本身不会写入数据。

V5.3.0 继续使用 Backup JSON schema 11、Dexie version 4 和八张表。恢复完整备份会先展示差异且不会立即写库；Obsidian 交换包与全量备份使用不同的 `packageType` 和入口，不能互相恢复。

在线地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/](https://zhuyong1297-dev.github.io/life-rpg-pwa/)

正式版本：[地球 Online V5.2.1](https://github.com/zhuyong1297-dev/life-rpg-pwa/releases/tag/v5.2.1)

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

- IndexedDB 八张表是唯一事实来源，不需要账号或后端。
- 全量备份使用 JSON schema 11 并兼容恢复 schema 1 至 10；愿望图片、奖励券、逐次进度与规划草稿进入全量备份。
- Obsidian 行动包 schema 1 继续兼容旧 28 天方案；schema 2 支持一个主原则、最多两个辅助知识、7 天试跑与 28 天正式赛季。
- `earth-online.obsidian-planning-context` 只导出当前阶段和最多三项关键行为定义。
- `earth-online.obsidian-application-result` 只导出阶段周期、聚合完成数据、现实指标、人工决定和理由；不包含每日流水、XP、金币、愿望或账本。
- 两种 JSON 使用不同入口和事务；知识行动包绝不调用全量恢复。
- 公开仓库只包含通用代码与人物素材，不包含个人活动、账本或迁移文件。
- `.private/` 只用于本机迁移验收，已被 Git 忽略。

虚构示例：[旧 schema 1 行动包](examples/obsidian-knowledge-action-package.example.json) · [7 天行动包](examples/obsidian-application-trial.action.example.json) · [28 天行动包](examples/obsidian-application-season.action.example.json) · [规划上下文](examples/planning-context.example.json) · [阶段结果](examples/application-result.example.json)

## 部署

`main` 是正式版来源，`ui-redesign` 是手机预览来源。任一分支推送后，GitHub Actions 会把正式版部署到 `/life-rpg-pwa/`，把预览版部署到 `/life-rpg-pwa/preview/`。两个入口使用不同的 IndexedDB、manifest 和 Service Worker 范围。
