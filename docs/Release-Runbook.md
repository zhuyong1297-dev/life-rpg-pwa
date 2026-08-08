# 正式发布手册

只有用户明确说“更新版本”“发布版本”或“提交正式版”时执行完整正式发布；“仅预览”不更新 `main`、正式 Pages、标签或 Release。

1. 检查工作区、当前分支、版本来源、远程分支、标签和 Release；远程存在分叉或冲突时停止。
2. 按 SemVer 同步界面版本、备份兼容版本、测试断言和当前文档。
3. 运行 `pnpm context:check`、严格 TypeScript、Vitest、预览构建、`pnpm test:e2e` 和隐私扫描；`test:e2e` 会先重建正式 `dist`，避免误用预览基址。
4. 提交范围必须明确且工作区干净；不得覆盖用户无关改动。
5. 默认执行 `pnpm publish:api -- <commit> ui-redesign main`，用 Git Data API 非强制快进并校验远程 commit 与 tree SHA。
6. 命令失败先检查已完成的远程检查点，只补缺失步骤；远程未更新时可用直接 `gh api` 快进缺失分支。
7. 只有 GitHub API 不可用且确认可非强制快进时才使用普通 `git push`；永不强推。
8. Actions 未触发时执行 `workflow_dispatch`；构建或部署失败时停止创建标签和 Release。
9. Pages 成功后核验正式 HTML、实际 JS 资源、界面版本和备份 schema，再创建不可变标签与 Release。
10. 同步稳定 Obsidian 目录中的 Version、Dashboard、System-Spec 和长期记忆，再刷新 `codebase-memory` 索引。

安全备用步骤可以自动执行；测试失败、tree SHA 不一致、线上版本不匹配、标签指向其他提交或 Release 冲突必须停止并报告。
