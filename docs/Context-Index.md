# 上下文读取索引

本文件用于让新任务只读取完成当前工作所需的上下文。开始前先运行 `git status --short`，不要默认整篇读取规格或巨型源码。

| 任务 | 先定位 | 必要文档 |
| --- | --- | --- |
| 行动、目标、奖励计算 | `src/domain/` 中对应模块及调用方 | PRD/Tech-Spec 中相关标题 |
| IndexedDB 与事务 | `src/db/`、`src/db.ts` 兼容入口及对应测试 | Tech-Spec 的数据与事务章节 |
| 行动或成长界面 | `src/features/`、`src/prototype/v5/` | `DESIGN.md` 与相关产品章节 |
| 赛季与建议 | season/coach 模块及测试 | PRD 的赛季章节 |
| Obsidian 交换 | knowledge package、application bridge 及测试 | Tech-Spec 的交换契约章节 |
| 备份与恢复 | `src/backup.ts` 及恢复测试 | Tech-Spec 的备份章节 |
| 正式发布 | Git 状态、版本常量和 workflow | `docs/Release-Runbook.md` |

读取顺序：`codebase-memory` 结构查询 → `rg` 搜索符号与标题 → 读取窄范围片段 → 必要时追踪调用方。只有跨领域迁移或全局架构审计可以整篇读取 PRD/Tech-Spec。

公共功能计划写入 GitHub Issue；包含个人活动、备份或现实隐私的计划只写入 Git 忽略的 `.private/plans/`。
