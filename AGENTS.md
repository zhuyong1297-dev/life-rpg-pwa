# 地球 Online 协作规则

## 项目定位

这是手机优先、本地离线的个人成长教练。游戏化只负责即时反馈，28 天赛季、现实证据和复盘用于判断行为是否真正有效；不以任务数、XP 或金币最大化为目标。

## 技术与数据边界

- 技术栈：React、TypeScript、Vite、Dexie、Zod、Lucide、Vitest、Playwright 和普通 CSS；不增加后端、账号、云同步或状态管理框架。
- IndexedDB 是唯一事实来源。当前契约为 Dexie version 4、八张表、JSON schema 11，并兼容恢复 schema 1 至 10。
- 完成、撤销、奖励锁定和退款使用追加式账本；不得重写历史事件。活动编辑和删除前必须保留完成、领域、难度、目标与复盘快照。
- 导入先完整校验，再在单个事务中整体替换；任何跨表业务操作必须原子、幂等并覆盖失败回滚。
- 游戏日以设备本地 `04:00` 分界，真实 ISO 时间戳不偏移，已有 `occurredOn` 永不重写。
- `main` 部署正式路径 `/life-rpg-pwa/`，数据库为 `earth-online-v2`；`ui-redesign` 部署 `/life-rpg-pwa/preview/`，使用 `earth-online-preview-v2` 和独立 manifest、Service Worker scope。
- 公开源码、构建产物和 Git 历史不得包含个人活动、账本、备份、迁移数据、外部服务 ID 或凭据；secret 只由本机环境管理。

## 产品不变量

- 六个成长领域的稳定 ID 为 `health`、`learning`、`creation`、`career`、`life`、`mindset`；每项行动只选一个最终改善的领域，旧属性仅解释旧历史。
- 活跃关键行为最多三项；同一时间最多一个 28 天赛季。赛季以现实标准和证据判断成效，建议未经确认不得修改活动。
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
- 发布前通过测试、正式/预览构建、隐私扫描和离线验收；预览确认后才同步 `main` 并创建 Release。
- GitHub 发布默认使用 `pnpm publish:api -- <提交> <分支...>`，通过已登录的 GitHub CLI 调用 Git Data API、执行非强制快进并校验远端 tree SHA；普通 `git push` 只在 API 不可用或用户明确要求时使用。
- API 发布前必须提交全部目标改动并保持工作区干净；标签、Release 和 Actions 查询继续使用 `gh`，不得在脚本或项目中保存凭据。

## 文档与记忆

- 文档以简体中文为主，必要时保留英文技术术语。
- `AGENTS.md` 只保存强制规则；功能细节写入 PRD/技术规格，不在这里重复。
- `MEMORY.md` 不是 changelog，只保留当前架构、长期取舍、用户纠正、真实踩坑和非机密运维信息。
- 新决策取代旧决策时直接更新原条目；发布记录、提交号、Actions 编号和测试数字交给 Git、Release 与 Obsidian `Version.md`。
- 最终汇报说明是否更新 `MEMORY.md`。
