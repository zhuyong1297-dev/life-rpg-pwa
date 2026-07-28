# 地球 Online 协作规则

## 项目定位

这是手机优先、本地离线的个人成长教练。游戏化只负责即时反馈，28 天赛季、现实证据和复盘用于判断行为是否真正有效；不以任务数、XP 或金币最大化为目标。

## 技术与数据边界

- 技术栈：React、TypeScript、Vite、Dexie、Zod、Lucide、Vitest、Playwright 和普通 CSS；不增加后端、账号、云同步或状态管理框架。
- IndexedDB 是唯一事实来源。当前契约为 Dexie version 4、八张表、JSON schema 12，并兼容恢复 schema 1 至 11。
- 完成、撤销、奖励锁定和退款使用追加式账本；不得重写历史事件。活动编辑和删除前必须保留完成、领域、难度、目标与复盘快照。
- 导入先完整校验，再在单个事务中整体替换；任何跨表业务操作必须原子、幂等并覆盖失败回滚。
- 游戏日以设备本地 `04:00` 分界，真实 ISO 时间戳不偏移，已有 `occurredOn` 永不重写。
- `main` 部署正式路径 `/life-rpg-pwa/`，数据库为 `earth-online-v2`；`ui-redesign` 部署 `/life-rpg-pwa/preview/`，使用 `earth-online-preview-v2` 和独立 manifest、Service Worker scope。
- 公开源码、构建产物和 Git 历史不得包含个人活动、账本、备份、迁移数据、外部服务 ID 或凭据；secret 只由本机环境管理。

## 产品不变量

- 六个成长领域的稳定 ID 为 `health`、`learning`、`creation`、`career`、`life`、`mindset`；每项行动只选一个最终改善的领域，旧属性仅解释旧历史。
- 活跃关键行为最多三项；同一时间最多一个 7 天 Application 试跑或一个 28 天赛季。阶段是否继续只能由用户根据现实标准和证据判断，不得按打卡自动升级；建议未经确认不得修改活动。
- 简单、普通、困难、Boss 奖励为 `5/2`、`10/5`、`20/10`、`50/25`（XP/金币）；等级、时长和次数不得放大奖励倍率。
- 分层目标可为两层或三层；首次达层发完整金币，升级只补 XP。每周逐次累计只在跨层时发奖励，整周不超过原难度上限。
- 撤销追加 correction；同一活动同一周期的净奖励不得重复。一次性任务完成后保留到当前游戏日结束，历史数据永久保留。
- 当前完整行为定义以 `PRD.md` 和 `Tech-Spec.md` 为准，本文件不复制功能清单。

## 界面底线

- 五个一级入口为行动、成长、复盘、愿望、我的；复杂功能使用 Hash 二级页或按需弹层。
- 视觉采用亮色“现代冒险日志”：功能名优先，RPG 词汇只作辅助；圆角不超过 8px，触控区域至少 44px。
- 信息默认紧凑，长历史、完整路线和管理列表按需打开；文本不得溢出、遮挡或挤压操作。
- 手机检查 320px 与 Android 主视口，桌面检查双栏；动画支持 `prefers-reduced-motion`。
- 声音、振动和通知失败不得影响奖励事务；完成事务成功后才能播放反馈。

## 开发与发布

```bash
pnpm dev
pnpm test
pnpm test:e2e
pnpm build
pnpm build:preview
pnpm privacy:scan
pnpm publish:api -- HEAD ui-redesign main
```

- 先读相关代码和调用路径，复用现有模型与事务；保持改动最小，不做无关重构。
- 领域逻辑变更补单元测试；事务变更覆盖幂等、回滚和撤销重做；界面变更覆盖窄屏、Android、桌面和无溢出。
- `pnpm test:e2e` 使用正式 base；若刚执行预览构建，先重新 `pnpm build`。
- 用户提出“更新版本”“发布版本”或“提交正式版”且未明确限定“仅预览”时，默认完成版本更新、正式部署、标签、Release 和文档同步的完整闭环；普通功能开发仍先进入预览。

### 正式发布状态机

1. 检查工作区、当前分支、版本来源、远程分支、标签和 Release，按变更语义确定 SemVer。
2. 同步界面版本、备份兼容版本、测试断言和当前文档；通过严格 TypeScript 检查、Vitest、正式/预览构建、正式 Playwright、隐私扫描和离线验收。
3. 提交全部目标改动并保持工作区干净，默认运行 `pnpm publish:api -- <提交> ui-redesign main`，以 Git Data API 非强制快进并校验远端 tree SHA。
4. 发布命令失败时，先用提交 SHA、tree SHA 和远程引用判断已经完成的检查点；只补做缺失步骤。远程尚未更新时可用直接 `gh api` 快进缺失分支。
5. 只有 GitHub API 不可用且已确认远程可以非强制快进时才使用普通 `git push`；永不自动强推。
6. Actions 未触发时执行 `workflow_dispatch`；部署失败时停止，不创建正式标签或 Release。
7. Pages 成功后核验正式 HTML、实际加载的 JS 资源、版本号和 schema，再创建标签及不可变 Release。
8. 同步 Obsidian 版本目录、Version、Dashboard、System-Spec、AGENTS 和 MEMORY，随后刷新 `codebase-memory` 索引。

- 安全、幂等、可校验的备用步骤可以自动执行；远程分叉、标签或 Release 冲突、tree SHA 不一致、测试失败、线上版本不匹配时必须停止并报告。
- 高频发布的新成功路径覆盖旧默认，不记录动态失败次数或单次故障流水；只有明确根因才永久调整路径顺序。
- 已安装 PWA 更新问题优先核验 Service Worker、HTML 与资源版本；不得通过卸载应用或清除站点数据处理缓存。
- 标签、Release 和 Actions 查询继续使用 `gh`，凭据只由本机 GitHub CLI 管理。

## 文档与记忆

- 文档以简体中文为主，必要时保留英文技术术语。
- `AGENTS.md` 只保存强制规则；功能细节写入 PRD/技术规格，不在这里重复。
- `MEMORY.md` 不是 changelog，只保留当前架构、长期取舍、用户纠正、真实踩坑和非机密运维信息。
- 新决策取代旧决策时直接更新原条目；发布记录、提交号、Actions 编号和测试数字交给 Git、Release 与 Obsidian `Version.md`。
- 最终汇报说明是否更新 `MEMORY.md`。
