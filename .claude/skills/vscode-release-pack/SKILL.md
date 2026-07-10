---
name: vscode-release-pack
description: EasyMarkdown VSCode extension release workflow for packages/vscode-extension: write the Marketplace CHANGELOG.md and a separate Chinese RELEASE_NOTES.zh-CN.md, manage the extension's independent version bump, build and verify a .vsix with vsce, and optionally publish to the VS Code Marketplace. Use this skill whenever the user mentions VSCode/VS Code plugin or extension release, vsix, vsce, Marketplace publishing, extension changelog or Chinese release notes, extension version bump, or packaging the EasyMarkdown VSCode extension, even if they only say "插件发版" or "扩展打包".
---

# vscode-release-pack

固化 EasyMarkdown 的 VSCode 扩展发版流程。目标目录是 `packages/vscode-extension/`，产物是 `easymarkdown-<version>.vsix`。

这个 skill 只管 VSCode 扩展，不管桌面 app 的 Windows zip。桌面 app 走 `release-pack`，维护仓库根 `RELEASE_NOTES.md`；VSCode 扩展走独立版本节奏，维护 `packages/vscode-extension/package.json`、Marketplace 使用的英文 `CHANGELOG.md`，以及与 VSIX 同目录的中文 `RELEASE_NOTES.zh-CN.md`。

关键事实：
- 根目录 `scripts/bump-version.mjs` 会读取 VSCode 扩展版本来生成网站/llms 文本，但**不会改写扩展自己的版本号**。
- 扩展打包命令在 `packages/vscode-extension` 内执行。`vsce package --no-dependencies` 会自动跑 `npm run vscode:prepublish`，也就是 `node esbuild.mjs --production`。
- `.vscodeignore` 会排除 `src/`、`webview/`、`node_modules/`、`sample/`、`*.vsix`、`RELEASE_NOTES.zh-CN.md` 等；VSIX 内应包含 `dist/`、`README.md`、`CHANGELOG.md`、`LICENSE`、`icon.png` 和 metadata。
- 本地 `.vsix` 通常被 gitignore，不要提交。
- `RELEASE_NOTES.zh-CN.md` 是给中文用户和 GitHub Release 使用的独立成果物，应提交到仓库，但不进入 VSIX；英文 `CHANGELOG.md` 仍是版本范围与 `head` 锚点的唯一真源。

## Claude 调用方式

用户可能写 `/vscode-release-pack`、`/vscode-release-pack 1.3.5`，也可能只说"给 VSCode 插件发版"、"打一个扩展 vsix"、"发布到 Marketplace"。只要意图符合 description，就按本 skill 执行。

- `/vscode-release-pack`：以当前 `packages/vscode-extension/package.json` 的版本作为候选版本，先检查是否与 `CHANGELOG.md` 顶部一致，再让用户确认。
- `/vscode-release-pack <version>`：目标版本，形如 `1.3.5`，带不带 `v` 前缀都可。
- `--notes-only`：只更新英文 `CHANGELOG.md`、中文 `RELEASE_NOTES.zh-CN.md` 和必要的版本文件，不打 VSIX，不推进 changelog head 锚点。
- `--pack-only`：只用当前工作区打 VSIX，不改 `CHANGELOG.md`、不改版本、不推进 changelog head 锚点。
- `--publish`：VSIX 验证通过后发布到 VS Code Marketplace。必须在发布前再次让用户明确确认。
- `--pre-release`：只在用户明确要发预发布版本时使用，并同时传给 `vsce package` / `vsce publish`。

args 的第一个非 `--` token 即版本号；没有则为无参模式。若用户用自然语言给出版本号，也按同样规则抽取。

## 前置读取

先读取这些事实，不要凭记忆发版：
- `packages/vscode-extension/package.json`：`name`、`displayName`、`version`、`publisher`、`engines.vscode`、`main`、`scripts`、`contributes`。
- `packages/vscode-extension/package-lock.json`：确认顶层版本是否会随 bump 更新。
- `packages/vscode-extension/CHANGELOG.md`：顶部版本号、可选 `<!-- head: <short hash> -->` 锚点。
- `packages/vscode-extension/RELEASE_NOTES.zh-CN.md`：若存在，读取顶部版本与既有中文表述；范围与锚点仍以 `CHANGELOG.md` 为准。
- `packages/vscode-extension/README.md` 与 `.vscodeignore`：Marketplace 页面与打包清单的真源。
- 当前 HEAD short hash：`git rev-parse --short HEAD`。
- 已存在的本地 VSIX：`Get-ChildItem packages/vscode-extension -Filter *.vsix`，只作为提示，不作为唯一真源。

官方背景文档需要时再查：VS Code "Publishing Extensions" 文档说明 `vsce package` 产出 VSIX、`vsce publish` 发布 Marketplace、README/CHANGELOG/LICENSE 会进入 Marketplace 展示。链接：https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## 预检

必须在任何写操作之前完成。

1. 看工作区状态：
   - `git status --porcelain -- packages/vscode-extension`
   - `git status --porcelain`
2. 如果 `packages/vscode-extension` 子树在开始前就有用户未提交改动，先停下说明。除非用户明确说继续，否则不要把这些改动混进发版。
3. 根目录其他文件脏不必阻塞插件打包，但最终汇报要列出来，说明它们不属于本次插件产物。
4. 在扩展目录检查工具：
   - `vsce --version`
   - `npm --version`
5. 如果 `vsce` 不在 PATH，先说明需要 `npm install -g @vscode/vsce` 或用户同意后临时用 `npx --yes @vscode/vsce`。不要静默拉取新工具。

不要在聊天里要求用户提供 PAT。发布凭据应通过本机 `vsce login <publisher>`、`VSCE_PAT` 环境变量，或 `vsce` 自己的安全输入流程处理。

## 模式判定

### 普通发版

普通发版会写 `CHANGELOG.md`、必要时 bump 版本、打 VSIX。若用户明确要发布 Marketplace，再走发布步骤。

目标版本：
- 有 `<version>` 参数：使用该版本，去掉可选 `v` 前缀。
- 无参数：以 `package.json` 当前版本作为候选，但不要直接落盘；先对照 `CHANGELOG.md` 顶部版本和现有 VSIX，向用户说明是否一致。

### notes-only

只写英文 changelog、中文 release notes 与必要版本文件，不打包，不发布，不推进 `head` 锚点。因为没有产出外部分发物，`head` 仍应指向上一次真正打包/发布的 commit。

### pack-only

只打当前版本的 VSIX，不写 changelog、不 bump、不推进锚点。若 changelog head 到 HEAD 或扩展目录 git log 中有新提交，先提醒用户："这些改动会进 VSIX，但不会进 CHANGELOG"，等确认。

## 定位变更范围

优先用 `CHANGELOG.md` 的隐藏锚点：

```md
## 1.3.5
<!-- head: abc1234 -->
```

`head` 的含义是"已经进入上一次扩展 VSIX 或 Marketplace 发布的最后一个 commit"。它是范围锚点，不是版本语义边界。

有锚点时：
- 增量更新同一版本：范围 = `git log --oneline <head>..HEAD -- packages/vscode-extension`
- 新版本：范围 = 旧顶部节的 `<head>..HEAD`

没有锚点、锚点为 `pending`，或 `CHANGELOG.md` 顶部版本与 `package.json` / 本地 VSIX 明显错位时，不要猜。给用户候选范围：

```bash
git log --oneline -- packages/vscode-extension
git log --oneline -S '"version": "<topVersion>"' -- packages/vscode-extension/package.json
```

把候选 commit 列出来，问用户"从哪一条之后开始算本次插件发版？"。首次采用本 skill 时，可以在本次成功发包后给顶部 changelog 节补入 `<!-- head: <short hash> -->`。

## 写 CHANGELOG 草稿

扩展的 `CHANGELOG.md` 当前是英文，Marketplace 也直接展示它；默认继续写英文。聊天说明继续用中文。除非用户明确要求中文，不要把扩展 changelog 改成中文。

写作原则与 app 发版相同：给最终用户看，不是 commit 翻译。

纳入：
- 新命令、新菜单、新快捷键、新设置项。
- Keep editor 的可见行为变化。
- Markdown 渲染、编辑、保存、撤销、滚动同步、查找替换、图片、链接、表格、Mermaid/KaTeX 等用户能感知的改进。
- VSCode 集成行为变化，例如默认编辑器、diff editor 保护、activationEvents、Command Palette、editor/title menu。
- 用户会遇到现象的 bug 修复。

排除：
- 纯重构、内部文件搬家、依赖升级、构建脚本调整、测试、代码风格。
- 用户感知不到的微优化。
- 只影响桌面 app、不影响 `packages/vscode-extension` 的改动。

草稿格式：

```md
## 1.3.5
<!-- head: pending -->

- **Short user-facing feature or fix** — concrete explanation.
- **Fix: specific user-visible bug** — what no longer happens.
```

如果用户要求沿用旧格式且没有锚点，可以先不插入 `head`，但要说明后续范围会继续依赖人工确认。推荐插入隐藏锚点，Marketplace 不会显示 HTML 注释。

写完草稿后自查：
- 草稿里是否出现新命令/设置/快捷键？如果有，`package.json` 的 `contributes` 与 `README.md` 必须同步。
- 草稿里是否提到 Marketplace 页面上应展示的能力？如果有，`README.md` 的 Features / Getting started 也要同步。
- 是否误把 app-only 改动写进插件 changelog？

## 写中文 RELEASE_NOTES 草稿

`packages/vscode-extension/RELEASE_NOTES.zh-CN.md` 是与 VSIX 同目录交付的中文更新日志，供直接分发和 GitHub Release 使用。它不进入 VSIX，也不替代 Marketplace 展示的英文 `CHANGELOG.md`。

英文 `CHANGELOG.md` 是版本范围、顶部版本和 `head` 锚点的唯一真源。中文文件只表达同一批已确认的用户可见改动，不再维护第二个 `head`，避免两个范围锚点漂移。

普通发版与 `--notes-only` 都同步中文文件：
- 文件不存在时创建；已存在时把最新版本放在最上方，保留旧版本与用户手动编辑。
- 同版本增量时合并进顶部版本，避免重复条目；新版本时插入新的 `## v<target>` 节。
- 内容用简体中文，从最终用户视角重写，不逐字翻译 commit；与英文 changelog 保持事实一致。
- `--pack-only` 不写中文日志，因为该模式承诺不改任何发行说明。

固定结构：

```md
# EasyMarkdown VSCode 扩展更新日志

<!--
中文发行说明。版本范围与 head 锚点以同目录 CHANGELOG.md 为准。
-->

## v1.3.5

EasyMarkdown VSCode 扩展 v1.3.5 更新日志

本次更新主要……（一句话概述）。

### 新增与优化

- ……

### 问题修复

- ……
```

某一组没有条目时省略该组，不要留下“无”或空列表。纯构建、依赖、测试和内部重构仍按英文 changelog 的筛选规则排除。

## 版本号建议

VSCode 扩展面对的是用户安装包，不是代码库 API。版本号表达用户需要投入多少注意力：

- PATCH：只修 bug，或用户无需学习的新稳定性改进。
- MINOR：新命令、新设置、新 UI/UX 能力、默认打开方式变化、明显行为增强。
- MAJOR：用户必须适应，或旧版本无法安全回退；例如最低 VSCode 版本显著抬高、配置/存储兼容性破坏、默认行为大幅改变。

在落盘前把建议告诉用户，由用户拍板。若无参模式但草稿明显是 MINOR，就建议开新版本，而不是把一批新能力塞进当前 patch。

## 落盘顺序

只有在用户确认范围、changelog 草稿、目标版本后才写文件。

1. 更新 `packages/vscode-extension/CHANGELOG.md`。
   - 新版本：在顶部插入 `## <target>`，锚点先写 `pending`。
   - 同版本增量：在顶部节补条目，保留用户手动编辑。
2. 按“写中文 RELEASE_NOTES 草稿”同步 `packages/vscode-extension/RELEASE_NOTES.zh-CN.md`，与英文条目使用同一批已确认事实。
3. 如果能力说明变了，同步 `packages/vscode-extension/README.md`。
4. 如果命令、菜单、配置、快捷键或最低 VSCode 版本变了，同步 `packages/vscode-extension/package.json` 对应字段。
5. 如果目标版本不同于当前 `package.json` 版本，在 `packages/vscode-extension` 目录运行：

```bash
npm version <target> --no-git-tag-version
```

不要手工只改 `package.json`。`npm version --no-git-tag-version` 会同步 `package-lock.json`，且不会创建 commit/tag。

落盘后检查：

```bash
node -e "const p=require('./package.json'),l=require('./package-lock.json'); if(p.version!==l.version || p.version!==l.packages[''].version){process.exit(1)} console.log(p.version)"
```

## 构建与打包

在 `packages/vscode-extension` 目录执行。

1. 构建：

```bash
npm run build
```

2. 预览将进入包内的文件：

```bash
vsce ls --no-dependencies
```

确认没有 `src/`、`webview/`、`node_modules/`、`sample/`、旧 `.vsix`、`.map`、`RELEASE_NOTES.zh-CN.md`。

3. 打 VSIX：

```bash
vsce package --no-dependencies
```

如果是预发布：

```bash
vsce package --no-dependencies --pre-release
```

不要随手去掉 `--no-dependencies`。本扩展通过 esbuild 把依赖打进 `dist/`，`.vscodeignore` 又排除了 `node_modules/`；如果 vsce 在依赖检测上报错，先调查 bundle 与 ignore 规则。

4. 验证产物：

```bash
tar -tf easymarkdown-<version>.vsix
```

必须包含：
- `extension/package.json`
- `extension/readme.md`
- `extension/changelog.md`
- `extension/LICENSE.txt`
- `extension/icon.png`
- `extension/dist/extension.cjs`
- `extension/dist/webview.js`
- `extension/dist/webview.css`

不得包含：
- `extension/src/`
- `extension/webview/`
- `extension/node_modules/`
- `extension/sample/`
- `extension/RELEASE_NOTES.zh-CN.md`
- `*.map`
- 其他 `.vsix`

如果验证失败，删除失败产物并停止说明原因。

## 回填 changelog head

普通打包与 `--publish` 模式都在 VSIX 验证成功后，把顶部节的 `<!-- head: pending -->` 改成当前 HEAD short hash。不要为了等待 Marketplace 结果而延后：锚点记录的是已进入合法 VSIX 的 commit；如果后续 Marketplace 发布失败，保留已经回填的锚点和已验证 VSIX，并单独汇报发布失败。

VSIX 构建或验证失败时不要推进锚点，这样下次重跑仍会扫到同一批 commit。Marketplace 发布失败但 VSIX 已验证成功时不回滚锚点。

`--notes-only` 与 `--pack-only` 都不推进锚点。

## 发布到 Marketplace

只有在用户明确要求发布，或传入 `--publish` 时才执行。发布前必须再次确认：

- publisher/name/version，例如 `easy-chen.easymarkdown@1.3.5`
- VSIX 路径与大小
- changelog 已写入包内
- 是否为预发布

发布命令：

```bash
vsce publish --packagePath easymarkdown-<version>.vsix
```

预发布：

```bash
vsce publish --packagePath easymarkdown-<version>.vsix --pre-release
```

不要在对话中接收或复述 PAT；也不要把 PAT 写进命令。若 `vsce` 要求登录，让用户在本机完成 `vsce login easy-chen` 或配置 `VSCE_PAT`。

不要默认使用 `--skip-duplicate`。版本重复通常代表已经发布过或版本号错了，应停下确认。

## 汇报

最终汇报用中文，给出：
- 模式：notes-only / pack-only / package / publish。
- 版本号、publisher/name。
- `vsce` 版本。
- changelog 是否更新、head 是否回填。
- 中文 `RELEASE_NOTES.zh-CN.md` 是否更新，并给出绝对路径。
- `git status --porcelain` 的实际输出，区分插件目录变更和无关根目录变更。

package / pack-only / publish 模式还要给出 VSIX 绝对路径、大小与包内容验证结果。notes-only 明确写“未生成 VSIX”，不要给出不存在的产物信息。

然后列出本 skill 不擅自做、但发版后通常要做的待办：
- 提交 `packages/vscode-extension/package.json`、`package-lock.json`、`CHANGELOG.md`、`RELEASE_NOTES.zh-CN.md`、`README.md` 等实际变更。
- 如需留独立里程碑，可由用户决定打扩展专用 tag，例如 `vscode-v<version>`；不要擅自 tag。
- 如未使用 `--publish`，由用户决定上传 VSIX 到 Marketplace 或 GitHub Release。

## 注意

- 不要碰仓库根 `RELEASE_NOTES.md`，除非用户同时明确要发桌面 app。VSCode 扩展的中文日志固定写到 `packages/vscode-extension/RELEASE_NOTES.zh-CN.md`。
- 不要在中文日志里复制 `head` 锚点；范围与锚点只由英文 `CHANGELOG.md` 维护。
- 不要跑根目录 `npm run version:bump` 来改插件版本；它不负责插件版本。
- 不要提交或 tag，除非用户明确要求。
- 不要把 Marketplace PAT、Azure token 或其他密钥写进文件、命令、日志或对话。
- 如果插件版本、CHANGELOG 顶部版本、本地 VSIX 版本三者错位，先解释错位状态，再继续。不要为了"赶紧出包"静默覆盖。
