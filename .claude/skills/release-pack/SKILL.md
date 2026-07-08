---
name: release-pack
description: EasyMarkdown 的 Windows 加密 zip 打包 + 自动生成面向最终用户的中文更新日志（RELEASE_NOTES.md）。当用户说"打包/发版/出包/打个 zip/升级并打包"等时使用。支持版本号参数，如 /release-pack 1.0.14。
---

# release-pack

固化 EasyMarkdown 的 Windows 加密 zip 打包流程，并自动维护仓库根 `RELEASE_NOTES.md`（面向最终用户的中文发版说明，随包分发进 zip）。

确定性打包逻辑在 `scripts/pack.mjs`（由 `npm run pack` 调用）；本 skill 负责：参数解析、版本范围定位、**更新日志写作**、流程编排、验证、汇报。

## 调用方式
- `/release-pack` — 沿用 `RELEASE_NOTES.md` 顶部进行中版本（**增量模式**）
- `/release-pack <version>` — `<version>` 形如 `1.0.14`（带不带 `v` 前缀都可）
  - 若 `<version>` == 顶部版本 → 同增量模式
  - 若 `<version>` ≠ 顶部版本 → **新版本模式**（锁定顶部、开新节）
- args 的第一个 token 即版本号；无 args 则为增量模式。

## 前置读取
- `package.json` 的 `version`、`productName`
- `RELEASE_NOTES.md`：顶部节版本号 `topVer`、顶部节 head 锚点、（新版本模式还需）顶部节 head 作新节起点
- 当前 HEAD short hash：`git rev-parse --short HEAD`
- 仓库另有一份**英文 CHANGELOG.md**（记录早期 v0.1–v0.3 开发历史），本 skill **不动它**，只维护 `RELEASE_NOTES.md`。

## 模式判定

**增量模式**（无参 或 target == topVer）：
- 若 target 有值且 ≠ package.json.version → `Edit package.json` 把 `version` 改为 target。
- 范围 = `[topVer 节 head .. 当前 HEAD]`。
- 若 topVer 节 head == 当前 HEAD（无新 commit）→ 跳过写作，直接打包（纯重打包）。
- 若 topVer 节 head 为 `pending`/缺失（首次）→ 退化：找 `package.json` 中 `version` 字段上次变更的 commit 作起点（`git log -L /"version"/,+1:package.json` 或 `git log --oneline -S '"1.0.12"' -- package.json`），范围 = [该 commit 之后 .. HEAD]；找不到则 `git log --oneline -30` 让用户选起点。
- 写作：在顶部节**现有内容基础上补充新条目**（保留用户手动编辑），不新启节；把 head 推进为当前 HEAD。

**新版本模式**（target 有值且 ≠ topVer）：
- `Edit package.json` version → target。
- 顶部节被**锁定**（head 不再变）。
- 新节起点 = 原 topVer 节的 head；范围 = [起点 .. 当前 HEAD]。
- 在 `RELEASE_NOTES.md` 顶部（标题/维护说明下、旧 topVer 节之上）插入新节 `## v<target>` + head 锚点 + 内容。

## 步骤
1. **读取 + 模式判定**（见上）。
2. **定位范围 + 用户确认**：跑 `git log --oneline <range>`，在对话里展示，问"从这条开始/到这条为止，对吗？要调整请说。"用户确认或调整后再继续。
3. **写更新日志草稿（用户视角，非 commit 翻译）**——见下方"写作原则"。
4. **用户确认草稿** → 用 Edit 写入 `RELEASE_NOTES.md`（增量=就地更新顶部节内容 + 推进 head；新版本=插顶新节）。不要擅自 `git commit`，提交由用户决定。
5. **打包**：后台跑 `npm run pack`（= `dist:dir` + `pack.mjs`）。等完成（exit 0）。`pack.mjs` 自动完成 staging 重命名、7z AES-256 加密、还原 win-unpacked、自检 app.asar 大小；`extraFiles` 会把 `RELEASE_NOTES.md` 复制进解包目录，从而进 zip。
6. **验证**：`& "C:\Program Files\7-Zip\7z.exe" t -p<password> <zip>`（密码从 `scripts/pack.config.local.json` 读，不在对话里泄露除非用户要）。确认 `Everything is Ok`。可选 `7z l -p<password> <zip>` 确认含 `EasyMarkdown/RELEASE_NOTES.md` 和 `EasyMarkdown/EasyMarkdown.exe`。
7. **汇报**：模式、版本号、zip 路径、大小、app.asar 大小、更新日志已更新、解压即得的 `EasyMarkdown` 文件夹。

## 写作原则（用户视角，最关键）
更新日志是给**最终用户**看的，不是 commit 翻译。逐条 commit 先判定"用户能不能感知到"，再决定入不入日志，最后用用户语言重写。

**纳入**：新功能、UI/UX 变化、交互/操作优化、用户能直接感受到的性能提升、用户会遇到现象的 bug 修复、新增或调整的设置项、文件格式/兼容性变化。

**排除**：纯重构（`refactor`）、内部架构/模块拆分、依赖升级、构建/CI/打包配置、测试、代码风格、用户感知不到的微优化、纯文档（用户指南/README 类除外）。

**措辞**：用最终用户能懂的话，不用 commit 的技术术语；日文 commit 译成中文；一条改动一行，简洁具体。

**正反例**（基于本仓库真实 commit）：
- ✅ `feat(search): ワークスペース全文検索` → "新增在工作区内跨文件全文搜索"
- ✅ `feat(save): 手動保存に「保存しました ✓」トーストを追加` → "手动保存时显示『已保存 ✓』提示"
- ❌ `refactor(shared): i18n 文字列表と mermaid 描画コアを React/Milkdown 非依存モジュールへ分割` → 不入日志（纯架构拆分，用户无感）
- ❌ `docs: CLAUDE.md / AGENTS.md を更新` → 不入日志（内部文档）
- ⚠️ `perf(paths): isHeavyDoc のコードフェンス除外 + run 閾値 150→1000` → 仅当用户能感知到大文档更流畅才写"打开大文档更稳"，否则不入。

风格对齐用户给的 v1.0.12 模板：节首一行 `EasyMarkdown vX.Y.Z 更新日志`，接一句概述，再分 `新增与优化` / `问题修复` 两组列表。

## RELEASE_NOTES.md 结构（必须遵守）
- 最新版本在**最上**（在顶部的维护说明注释之下）。
- 每节 `## vX.Y.Z` 正下方一行隐藏锚点（HTML 注释，内容 `head: <short hash>`；skill 维护，请勿手改）；`pending` 表示待首次回填。
- 节示例（锚点写在 HTML 注释里，紧贴标题下方）：
  ```
  ## v1.0.14
  <!-- head: abc1234 -->

  EasyMarkdown v1.0.14 更新日志
  本次更新主要…（一句话概述）。
  新增与优化
  - …
  问题修复
  - …
  ```

## 注意
- **Windows 专属**：`pack.mjs` 用 7-Zip，路径默认 `C:\Program Files\7-Zip\7z.exe`。macOS 打包仍走 `npm run dist`，本 skill 不适用 macOS。
- 密码不在 skill、不在仓库；在 `scripts/pack.config.local.json`（已 gitignore）。缺它 `pack.mjs` 会报错并提示。
- 两次人工确认（范围、草稿）不能省，除非用户明确说"不用确认直接来"。
- 只维护 `RELEASE_NOTES.md`；英文 `CHANGELOG.md` 不碰。
- 不要擅自 `git commit`；只改文件，提交由用户决定。
