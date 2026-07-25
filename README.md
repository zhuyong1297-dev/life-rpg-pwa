# 地球 Online

地球 Online 是一个手机优先、本地离线的个人成长教练。它用经验、金币和六个现实成长领域提供即时反馈，再通过 28 天赛季、每周复盘和透明建议判断现实行动是否真的有效。

当前线上正式版与手机预览版均运行 V5.1.0。V5.1.0 增加安全的 Obsidian 知识行动包：行动包先经过独立 Zod 校验和冲突预览，只生成目标规划草稿，用户逐项确认并完成现实检查后才由既有赛季事务激活行为。

首页把普通习惯拆为“每日行动”和“本周进度”。每周目标使用紧凑里程碑轨道；组合目标先选择活动预设时长再记录，打开选择窗口本身不会写入数据。

V5.1.0 继续使用 Backup JSON schema 11，兼容恢复 schema 1 至 10；Dexie version 4 和八张表保持不变。知识行动包是另一种 JSON，只能进入规划器，不能恢复或覆盖数据库。

在线地址：[https://zhuyong1297-dev.github.io/life-rpg-pwa/](https://zhuyong1297-dev.github.io/life-rpg-pwa/)

正式版本：[地球 Online V5.1.0](https://github.com/zhuyong1297-dev/life-rpg-pwa/releases/tag/v5.1.0)

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
- Obsidian 知识行动包使用独立 `packageType` 和 schema 1，只保存必要的知识标题、稳定引用、现实目标与候选行为，不保存笔记全文。
- 两种 JSON 使用不同入口和事务；知识行动包绝不调用全量恢复。
- 公开仓库只包含通用代码与人物素材，不包含个人活动、账本或迁移文件。
- `.private/` 只用于本机迁移验收，已被 Git 忽略。

虚构示例：[examples/obsidian-knowledge-action-package.example.json](examples/obsidian-knowledge-action-package.example.json)

## 部署

`main` 是正式版来源，`ui-redesign` 是手机预览来源。任一分支推送后，GitHub Actions 会把正式版部署到 `/life-rpg-pwa/`，把预览版部署到 `/life-rpg-pwa/preview/`。两个入口使用不同的 IndexedDB、manifest 和 Service Worker 范围。
