---
name: release-pack
description: EasyMarkdown 的 Windows 加密 zip 打包 + 自动生成面向最终用户的中文更新日志（RELEASE_NOTES.md）。当用户提到打包、发版、出包、打个 zip、升级版本号、准备发布、release、更新日志、changelog、release notes 时都应该用这个 skill，哪怕他没明说"打包"两个字。支持版本号参数（release-pack 1.0.14 或 $release-pack 1.0.14）与 --notes-only / --pack-only。仅限 Windows。
---

# release-pack

固化 EasyMarkdown 的 Windows 加密 zip 打包流程，并维护仓库根 `RELEASE_NOTES.md`（面向最终用户的中文发版说明，随包分发进 zip）。

分工：**确定性的部分全在 `scripts/pack.mjs`**（预检、构建后打包、加密、完整性测试、清单断言）；本 skill 负责判断和写作——参数解析、版本范围定位、**更新日志写作**、流程编排、汇报。凡是脚本能保证的，skill 不要重做。

## Codex 调用方式
- 在 Codex 对话中，用户可能写 `$release-pack`、`release-pack`、`release-pack 1.0.14`，也可能只用自然语言说"帮我打包发版"或"更新 release notes"。只要意图符合 description，就按本 skill 执行。
- `release-pack` — 沿用 `RELEASE_NOTES.md` 顶部进行中版本（**增量模式**）
- `release-pack <version>` — `<version>` 形如 `1.0.14`（带不带 `v` 前缀都可）
  - `<version>` == 顶部版本 → 同增量模式
  - `<version>` ≠ 顶部版本 → **新版本模式**（锁定顶部节、开新节）
- `--notes-only` — 只写日志，不打包（走到步骤 5 为止）
- `--pack-only` — 只打包，不碰日志（跳过步骤 2–5 与 7）

用户请求中 skill 名称后的第一个非 `--` token 即版本号；没有则为增量模式。若用户用自然语言给出版本号，也按同样规则抽取。

## 前置读取
- `package.json` 的 `version`、`productName`
- `RELEASE_NOTES.md`：顶部节版本号 `topVer`、顶部节 head 锚点
- 当前 HEAD short hash：`git rev-parse --short HEAD`
- 仓库另有一份**英文 CHANGELOG.md**（早期 v0.1–v0.3 开发史），本 skill **不动它**。

`head:` 锚点的含义是「**已经随该版本发出去的最后一个 commit**」——它是划定日志范围的锚，不是版本的语义边界。所以：攒了几个 commit 却没重打包，之后 bump 版本时，这些 commit 会归进新版本的日志。这是对的。

## 模式判定

**增量模式**（无参 或 target == topVer）：
- 范围 = `git log --oneline <topVer 的 head>..HEAD`（`a..b` 左开右闭：不含 `<head>` 本身，含 HEAD）。
- 范围为空（head 已是 HEAD）→ 无新 commit，跳过写作，直接打包（纯重打包）。
- 写作时在顶部节**现有内容基础上补充新条目**，保留用户的手动编辑，不新启节。

**新版本模式**（target 有值且 ≠ topVer）：
- 顶部节被**锁定**（其 head 不再变），成为新节的起点。
- 范围 = `git log --oneline <原 topVer 的 head>..HEAD`。
- 在 `RELEASE_NOTES.md` 顶部（维护说明注释之下、旧 topVer 节之上）插入新节 `## v<target>`。

**head 为 `pending` 或缺失**（首次启用）：不要猜。运行下面的 git 命令拿一个候选起点；在 Windows PowerShell 中也可以直接使用这条写法，单引号负责保留内层双引号。
`git log --oneline -S '"version": "<topVer>"' -- package.json`
连同 `git log --oneline -30` 一起给用户挑。

## 步骤

**0. 预检——必须在任何写操作之前。**
- `npm run version:check`（秒级）。断言版本号的**全部 11 处落点**彼此一致（见下方"版本号落点"）。放最前面，是因为「日志写进 `v1.0.13` 那一节、zip 却叫 `1.0.14`」这类事故全程不报错，只能靠这一步拦住。
- `npm run pack:check`（秒级，不构建）。验证 7-Zip 存在、zip 密码已配置。缺任何一样都会让后面几分钟的构建白跑，而那时文件已经被改脏了。
- `git status --porcelain` 应为空。锚点记的是 commit hash，但 `npm run pack` 打的是**工作区**；工作区脏，zip 里的二进制就对应不上锚点声称的那个 commit，事后无从复现某个包从哪来。不干净就停下说明；用户坚持要打，就在最后的汇报里注明「本包不对应任何 commit」。

**1. 模式判定**（见上）。

**2. 定位范围 + 用户确认。** 跑上面的 `git log --oneline` 并把结果贴进对话，问"从这条开始、到这条为止，对吗？"。等用户确认或调整。

**3. 写更新日志草稿**（用户视角，不是 commit 翻译）——见下方"写作原则"。

写完先自问一句：草稿里有没有**新快捷键、新设置项、或保持模式的新能力**？有的话，`src/renderer/src/onboarding.js` 需要同步——它既是首启引导，也由 `gen-readme.mjs` 生成随包分发的 `README.md`，三种语言各一份。v1.1.0 就是因为没人做这一步，随包 README 里少了六个新快捷键。这属于"日志里出现了什么就补什么"，不是每次发版都要动。

**4. 用户确认草稿 + 提出版本号建议**（见下方"版本号建议"）。两件事一起问，因为此刻草稿的形状已经定了，而版本号必须在步骤 5 之前定下来。

**5. 落盘：先写 `RELEASE_NOTES.md` 正文，再跑 `npm run version:bump -- <version>`。锚点先不动。**
- 日志内容**必须在打包前写好**：`extraFiles` 是在 `electron-builder --dir` 执行的那一刻，把仓库根的 `RELEASE_NOTES.md` 快照进解包目录的。晚一步，zip 里就是上一版的日志，而且不会有任何报错。别为了"打包成功再写更稳妥"把这步挪后面。
- 顺序：**先写正文**（含新版本模式下插入的 `## v<target>` 节），**再跑 bump**。bump 会拒绝在"日志顶部版本 ≠ package.json 版本 且 ≠ 目标版本"时改写——那意味着两者失步，盲目改写会把上一个版本的小节挂上新版本号。
- **不要手动编辑 `package.json` 或只改单个版本号落点。** 版本号有 11 处落点，手改必漏。`bump` 一次改完并自检；漏改任何一处，下次的 `version:check` 会红。
- version 拖到现在才改，是因为前面有两次人工确认，用户随时可能喊停；改早了会平白留下一批脏文件。

**6. 打包。** 后台跑 `npm run pack`（= `dist:dir` + `pack.mjs`），等 exit 0。脚本自己完成 staging 重命名、7z AES-256 加密、还原 `win-unpacked`、app.asar 体积自检、**完整性测试**、以及**清单断言**（zip 内必须有 `EasyMarkdown/EasyMarkdown.exe`、`RELEASE_NOTES.md`、`README.md`、`resources/app.asar`）。任一验证不过，脚本会删掉那个未通过的 zip 并非零退出。

所以这一步**只看退出码**。不要自己去拼 `7z t -p<password>` ——为了拼出那条命令你得先读 `pack.config.local.json`，密码就进了对话记录和 shell 历史。密码留在脚本里，谁都不必看见它。

**7. 回填锚点。** 打包成功后，把顶部节的 head 改成当前 HEAD。只在包真的产出后才推进，锚点才配得上"已发出去的最后一个 commit"这个含义。pack 失败时锚点保持原样，重跑会重新扫到同一批 commit——内容已经写好了，补不进新东西，无害。
（zip 里那份 `RELEASE_NOTES.md` 的锚点因此比仓库晚一步。它是 HTML 注释，用户看不见，仓库那份才是真源。不用"修正"。）

**8. 汇报：** 模式、版本号、zip 路径与大小、app.asar 大小、日志已更新、解压即得 `EasyMarkdown` 文件夹。

然后列出**本 skill 管不到、但发版应该做**的待办：
- 待提交的文件（`git status --porcelain` 的实际输出，通常是 `package.json`、`package-lock.json`、`RELEASE_NOTES.md`、`website/*`）。不要擅自 commit。
- `git tag v<version>` → GitHub Release → 上传 zip。**不做这一步，应用内的更新检查就永远拿不到新版本**：`main/index.js` 查的是 `releases/latest`，而官网导航栏与页脚的版本号也只是 GitHub API 拉不到时的兜底文本。
- 独立仓库 `easymarkdown-intro`：时间线副标题、stat 卡描述、页脚、`versionsData` 加一条。它不在本仓库，脚本不碰。
- VSCode 扩展（`packages/vscode-extension/`）走独立版本节奏，除非本次确实改了它，否则不动。

`--notes-only`：执行 0–5，停。不打包，也不推进锚点（什么都没发出去）。
`--pack-only`：执行 0、6、8。若 `head..HEAD` 非空，先告诉用户"这 N 个 commit 会进包但不会进日志"，等确认。锚点不动。

## 版本号落点

版本号在这个仓库里有 **11 处**，唯一的定义在 `scripts/bump-version.mjs` 的 `SITES` 表里——**不要在本文档里另抄一份清单**，两份会各自漂移。

- `npm run version:check` —— 断言全部落点与 `package.json` 一致，不一致就非零退出并逐条列出。无副作用，可随时跑，也可以进 CI。
- `npm run version:bump -- <version> [--date=YYYY-MM]` —— 原子改完全部落点（含 `llms.txt` / `llms-full.txt` 版本行里的 `（YYYY-MM）` 月份，以及从 `packages/vscode-extension/package.json` **读取**的扩展版本），跑一次 `npm install --package-lock-only`，然后自调 `--check` 自证。

脚本**不碰**的东西：`RELEASE_NOTES.md` 的 head 锚点与正文（那是判断，不是替换）、VSCode 扩展自身的版本、独立仓库 `easymarkdown-intro`。
**自动派生、无需任何人操心**的：状态栏与欢迎页的版本（`__APP_VERSION__`，由 `electron.vite.config.mjs` 从 `package.json` 注入）、zip 文件名（`pack.mjs`）、NSIS 安装包名（electron-builder 的 `${version}`）、`build/README.dist.md`（`gen-readme.mjs` 生成，本就不含版本号）。

如果某个落点的那一行被改写到正则匹配不上，`--check` 会报「版本行不再匹配」并要求更新 `SITES` 表——这是**硬错误，不是静默跳过**，否则守卫会在无人察觉中失效。

## 版本号建议

EasyMarkdown 是桌面应用，不是库——没有别的代码 import 它，所以 SemVer 那套「不兼容的 API 变更 = MAJOR」在这里无处安放。三位数字实际表达的是**用户需要投入多少注意力**：

- **PATCH（1.1.x）**——用户不必知道。只有 bug 修复和感知不到的优化，可以闭眼更新。
- **MINOR（1.x.0）**——用户会看到不一样的东西。新功能、新设置项、UI 明显变化。
- **MAJOR（x.0.0）**——用户必须知道，甚至得做点什么。判据不是"改动大不大"，而是**能不能安全降级**：`localStorage` 的 `easymarkdown.settings.v1` / `session.v1` 这类 schema 一旦升到 `v2` 且旧版读不了，或者默认行为变到用户必须重新适应，才是 MAJOR。单纯往设置里加键是向后兼容的（旧配置读出默认值），不构成 MAJOR。

**判据直接来自草稿的形状**，不用另立一套规则——"写作原则"筛的就是"用户能不能感知"：

- 草稿里有「新增与优化」条目 → **minor**
- 草稿里只剩「问题修复」 → **patch**

在步骤 4 连同草稿一起把建议告诉用户，**由用户拍板**，不要自己改版本号。若无参调用（增量模式）但草稿含新功能条目，就直接指出："这些是 minor 级改动，建议开 `v<next-minor>` 新节，而不是补进 `v<topVer>`"。

这条规则是有来历的：v1.0.13 曾经把工作区全文搜索、查找替换、设置面板、HTML 导出、打印、自动保存等九个新功能塞进一个 patch 号，事后不得不改名为 v1.1.0。版本号的形状应该能从日志的形状读出来。

## 写作原则（用户视角，最关键）
更新日志是给**最终用户**看的，不是 commit 翻译。逐条 commit 先判定"用户能不能感知到"，再决定入不入日志，最后用用户语言重写。

**纳入**：新功能、UI/UX 变化、交互/操作优化、用户能直接感受到的性能提升、用户会遇到现象的 bug 修复、新增或调整的设置项、文件格式/兼容性变化。

**排除**：纯重构（`refactor`）、内部架构/模块拆分、依赖升级、构建/CI/打包配置、测试、代码风格、用户感知不到的微优化、纯文档（用户指南/README 类除外）。

**必然出现的一条误报**：上一次发版的记账 commit（形如 `docs(release): v1.0.13 の更新履歴を確定し head アンカーを … に回填`）一定落在本次范围内——锚点指向被打包的那个 commit，而记录锚点的 commit 排在它后面。它是本 skill 自己的产物，永远不入日志。

**措辞**：用最终用户能懂的话，不用 commit 的技术术语；日文 commit 译成中文；一条改动一行，简洁具体。

**正反例**（基于本仓库真实 commit）：
- ✅ `feat(search): ワークスペース全文検索` → "新增在工作区内跨文件全文搜索"
- ✅ `feat(save): 手動保存に「保存しました ✓」トーストを追加` → "手动保存时显示『已保存 ✓』提示"
- ❌ `refactor(shared): i18n 文字列表と mermaid 描画コアを React/Milkdown 非依存モジュールへ分割` → 不入日志（纯架构拆分，用户无感）
- ❌ `docs: AGENTS.md / .agents skills を更新` → 不入日志（内部文档）
- ⚠️ `perf(paths): isHeavyDoc のコードフェンス除外 + run 閾値 150→1000` → 仅当用户能感知到大文档更流畅才写"打开大文档更稳"，否则不入。

风格对齐 v1.0.12 模板：节首一行 `EasyMarkdown vX.Y.Z 更新日志`，接一句概述，再分 `新增与优化` / `问题修复` 两组列表。

## RELEASE_NOTES.md 结构（必须遵守）
- 最新版本在**最上**（顶部维护说明注释之下）。
- 每节 `## vX.Y.Z` 正下方一行隐藏锚点（HTML 注释，内容 `head: <short hash>`；skill 维护，请勿手改）；`pending` 表示待首次回填。
- 节示例：
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
- **Windows 专属**：`pack.mjs` 用 7-Zip（路径可在 `pack.config.local.json` 的 `sevenZipPath` 覆盖）。macOS 打包走 `npm run dist`，本 skill 不适用。
- **不要读取、复述、或把 zip 密码写进任何命令。** 它在 `scripts/pack.config.local.json`（已 gitignore），只有 `pack.mjs` 需要它。缺文件时 `npm run pack:check` 会明确指出该怎么办。
- **两次人工确认（范围、草稿）不能省**，除非用户明确说"不用确认直接来"。范围错了，日志就会漏条目或混进上个版本的条目；而日志一旦随 zip 发到用户手里就收不回来了。
- 只维护 `RELEASE_NOTES.md`；英文 `CHANGELOG.md` 不碰。
- **不要擅自 `git commit` 或 `git tag`**；只改文件，提交由用户决定。
