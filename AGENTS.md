# 地球 Online 协作规则

## 目标与边界

- 这是手机优先、本地离线的个人成长教练；现实效果优先于 XP、金币和任务数量。
- IndexedDB 是运行事实来源。不得改变正式/预览隔离、追加式历史、原子事务或备份兼容，除非需求明确要求数据迁移。
- 公开源码、构建产物和 Git 历史不得包含个人活动、账本、备份、外部服务 ID 或凭据。

## 任务启动

- 一个较大功能使用独立任务；规划结论写入 GitHub Issue，含个人数据的计划写入 `.private/plans/`。
- 先检查 `git status`，再读 `docs/Context-Index.md`；优先用 `codebase-memory` 定位，工具不可用时使用 `rg`。
- 默认只读相关代码片段和规格章节，不整篇读取 PRD、Tech-Spec 或巨型源码。
- 保留用户未提交改动，复用现有接口，保持改动聚焦；功能行为以 PRD 和 Tech-Spec 为准。

## 验证与发布

```bash
pnpm context:check
pnpm test
pnpm build
pnpm build:preview
pnpm test:e2e
pnpm privacy:scan
```

- 领域逻辑补单元测试；事务覆盖幂等和回滚；界面覆盖 320px、Android、桌面、焦点和无溢出。
- “更新版本”“发布版本”“提交正式版”默认表示完整正式发布；“仅预览”才停止在预览。发布时读取 `docs/Release-Runbook.md`。
- 禁止强推。测试失败、远程分叉、标签/Release 冲突、tree SHA 或线上版本不一致时停止。

## 文档与记忆

- 文档以简体中文为主。`AGENTS.md` 只保存强制规则，`MEMORY.md` 只保存不可从代码直接发现的长期决策。
- 版本流水写入 Git、Release 与 Obsidian `Version.md`；新决策覆盖旧条目，不累计临时过程。
- 最终汇报说明测试结果、未完成项和是否更新 `MEMORY.md`。
