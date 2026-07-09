# 开发、构建与测试

## 本地开发

```bash
npm install
# 若 Electron 二进制下载被墙，先设镜像：
#   set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/   (Windows cmd)
#   $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" (PowerShell)
npm run dev
```

`npm run dev` 用 electron-vite 起开发模式：main/preload 用 esbuild 构建，renderer 用 Vite dev server（热重载）。

## 构建与打包

```bash
npm run build       # 构建到 out/（main + preload + renderer）
npm start           # 运行构建产物（electron-vite preview）
npm run dist        # 构建 + electron-builder 打**当前系统**的安装包 → dist/
npm run dist:dir    # 构建 + 打免安装目录版（dist/<platform>-unpacked/）
```

> `npm run dist` 按运行它的系统出包：Windows 上出 NSIS 安装包，macOS 上出 `.dmg` + `.zip`（dmg 必须在 macOS 上打）。

打包时若 electron-builder 的二进制下载慢，加镜像环境变量：
```
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

> 打包常见报错 `app-builder ... CANNOT_EXECUTE` 通常是 `dist/win-unpacked/EasyMarkdown.exe` 被占用（有实例在跑）—— 先关掉所有 EasyMarkdown 实例再打。

### 打包配置（package.json → build）

```jsonc
"build": {
  "appId": "com.easymarkdown.app",
  "productName": "EasyMarkdown",
  "files": ["out/**/*"],
  "icon": "build/icon.ico",
  "mac": { "target": ["dmg", "zip"], "icon": "build/icon.icns", "category": "public.app-category.productivity", "fileAssociations": [/* .md/.markdown */] },
  "win": { "target": ["nsis"], "icon": "build/icon.ico", "fileAssociations": [/* .md/.markdown */] },
  "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true, "allowElevation": true, "installerIcon": "build/icon.ico", "uninstallerIcon": "build/icon.ico" }
}
```

- 安装包**未签名**：Windows 首次运行 SmartScreen 提示"未知发布者"，点"更多信息 → 仍要运行"；macOS 首次打开被 Gatekeeper 拦，右键 → 打开，或 `xattr -dr com.apple.quarantine /Applications/EasyMarkdown.app`。需要免提示得配对应平台的签名证书（macOS 还需公证）。

### macOS 打包（已支持）

Windows 与 macOS 共用一份配置，在 macOS 上 `npm run dist` 即出 `.dmg` + `.zip`（默认 arm64；要 Intel 用 `"arch": ["x64", "arm64"]`）。

- 图标 `build/icon.icns` 由 `icon.png` 生成（mac 上 `iconutil`，或跨平台 `png2icns` / `electron-icon-builder`）。
- 跨平台已处理：快捷键同时认 `Ctrl`/`Cmd`（`metaKey`），`open-file`（Finder 打开）事件，标题栏 `hiddenInset` + 固定 `trafficLightPosition`，渲染层用 `.app.is-mac` / `.app.is-win` 区分平台样式。**改顶栏/平台相关代码时务必两个系统都别弄坏。**

> dev 模式在 macOS 上用 `osascript tell application "Electron"` 驱动时，可能误启动 `node_modules` 里的通用 Electron 壳（同名冲突，显示默认页）。验证请用打好的 **EasyMarkdown.app**（名字与 bundle id 唯一）。

## 自动化测试：单元测试（vitest）

纯函数（不依赖 DOM / Electron 的逻辑）用 **vitest** 做单元测试。对没有设计书的存量代码，采用**特征测试（characterization test）**思路：把"当前正确运行的行为"本身当作规格锁定，目的是在频繁迭代中挡住回归。

```bash
npm test           # 一次性跑全部（vitest run）
npm run test:watch # 监视模式（开发时用）
```

- 测试放在 `test/`（与 `src/` 同级），按被测模块命名（如 `test/keep-parser.test.js`）。
- 默认运行环境是 `node`。需要 `localStorage` / `document` 的测试在文件首行加 `// @vitest-environment happy-dom`（见 `test/settings.test.js`）。
- 配置在 `vitest.config.mjs`，镜像了 `electron.vite.config.mjs` 的 `define`（`__APP_VERSION__`）。
- **只测纯函数**。当前覆盖：`keep-parser`（Markdown 解析 / 表格编辑）、`paths`（跨平台路径 / 版本 / 工作区净化）、`components/editor-images`（相对路径 → `file://`）、`main/helpers`（`isRestrictedRoot`/`isAbsolutePath`/`MD_RE` 等 watcher 安全函数）、`settings`/`find`/`blocks`。
- **主进程纯函数已抽到 [src/main/helpers.js](../src/main/helpers.js)**（`index.js` 顶部 import 了 `electron`，测试无法直接 import index.js）。以后要单测新的主进程纯逻辑，先把它移到 helpers.js 再 import。
- 新增 / 改动纯函数时，同步补 / 改对应用例。DOM、ProseMirror 命令、异步渲染（mermaid 等）不在单测范围内 —— 由下面的 CDP（将来迁 Playwright）E2E 覆盖。

## 自动化测试：E2E（Playwright）

端到端测试用 **Playwright 的 Electron 支持**(`_electron.launch()`)：自动拉起**构建后的** app、把 committed 的 fixture 当 tab 打开、断言真实渲染的 DOM、跑完自己关。

```bash
npm run test:e2e   # 先 electron-vite build，再 playwright test
```

- 配置 `playwright.config.mjs`(testDir `test/e2e`,匹配 `*.spec.js`);用例在 [test/e2e/](../test/e2e/),fixture 在 `test/e2e/fixtures/`(committed,确定性)。
- **启动机制**在 [test/e2e/helpers.js](../test/e2e/helpers.js) 的 `launchApp()`:
  - 启动**构建产物** `out/main/index.js`(主进程无 `ELECTRON_RENDERER_URL` 时走 `loadFile(out/renderer/index.html)`)——所以**必须先 `npm run build`**(`test:e2e` 脚本已带)。
  - 每次启动传 `--user-data-dir=<临时目录>`:既隔离 session/localStorage,又绕开**单实例锁**(锁按 userData 分),不会被转发到正在跑的 dev 实例。
  - **清掉 `ELECTRON_RUN_AS_NODE`**:某些 shell/CI(包括本仓库的自动化环境)设了它,会让 electron 退化成纯 Node(`import 'electron'` 拿不到 app、进程直接退出 → Playwright 报 "Process failed to launch")。
  - teardown 用 `app.evaluate(({app}) => app.exit(0))` **强制退出**,绕过主进程"未保存变更"的关窗确认守卫(自动化下没人回 `app:confirm-close`,否则会挂起)。
- fixture 作为启动参数传入 → `extractArgs` 把 .md 开成 tab。首次运行(全新 userData)还会自动开"使用说明"引导文档,所以**断言前先点 fixture 的 tab 激活它**。
- **编辑器无关断言**:打开的 .md 在 **keep 模式**(`.km-*`,引擎是 `keep-parser.js`)渲染,而引导文档在 **Milkdown**(`.ProseMirror`)——所以用 `getByRole`/`getByText` 按语义断言,别绑定某一种编辑器的 class。
- 用例分两类:
  - **`smoke.spec.js`** —— 启动、开文件渲染标题、列表/表格块渲染。
  - **`interactions.spec.js`** —— 真实编辑(港自 `scripts/etv.mjs`):
    - keep 模式块"编辑源码"(点 `.km-src-edit` → `.km-src-editor` textarea → 改 → 点 `.km-src-actions .ok` 提交 → 重渲染);提交是 **Ctrl/Cmd+Enter 或点 OK**(Enter 是换行,Esc 取消)。
    - keep 模式表格单元格编辑(双击 `.km-table td` → `.km-cell-pop .km-cp-input` → 改 → OK),端到端覆盖 `keep-parser.js` 的 `replaceCellInLine`。
    - Milkdown 的 Ctrl+2 转标题 + 右键块菜单转换:先点状态栏 **"切换编辑模式"** 按钮(`button[title*="切换编辑模式"]`)把当前 tab 从 keep 切到 Milkdown(`.ProseMirror`);右键 → `.block-ctxmenu`(¶ + H1–H6 共 7 项)→ 点"标题 2"项,块转 H2。
- **选区浮动工具栏没港**:它是 Crepe 自带气泡(`.milkdown-toolbar`,app 往里注入了 `.hm-heading-item` 标题按钮),只在**真实指针拖选**时出现,且在自动化下不可靠地布局/可点(etv 旧的 `.block-selbar` 已不存在);它的块转换走的是和 Ctrl+2/右键菜单同一条路径(Editor.jsx),已被覆盖,故有意不测。选区若要测,用**真实鼠标拖选**(`page.mouse.down/move/up`,trusted 事件能驱动 ProseMirror 选区;合成 CDP 拖拽不行)。
- keep 模式相对图片→`file://` 已修并有 E2E(`images.md`),见下方"图片支持"。

> **行内渲染(keep 模式)**:`keep-parser.js` 的 `inline(text, baseDir)` 由 **markdown-it** 驱动(CommonMark + GFM),不再是手写正则。块级扫描(`parseDoc`)仍是自己的 —— keep 模式需要每个块在源码里的 `[start,end]` 行范围来保证零 diff 编辑;块内容只用于显示,所以交给规范实现。**不要再往 `inline()` 里加正则语法分支**。
>
> 图片:`![alt](src)` 的相对路径用 `editor-images.js` 的 `resolveToFileUrl(baseDir, src)` 解析成显示用的 `file://`(源里仍保留相对路径,与 Milkdown 一致),`http(s)/data/file` 直通;`javascript:/vbscript:` 被 markdown-it 的 `validateLink` 直接拒绝(整段退化为字面文本,比过去的空 `href` 更安全)。`baseDir` 由 KeepEditor 从 `docPath`(`dirOf`)经 `renderDoc`/`renderBlockInner` 传入。单测见 `test/keep-parser.test.js`,E2E 见 `test/e2e/fixtures/images.md` 与 `inline-syntax.md`。
>
> 历史背景(已修):
> - `inline()` 曾不识别图片语法,`![x](./a.png)` 在 keep 模式被渲染成多余的字面 `!` + 普通超链接 —— E2E 骨架阶段发现的真实 bug。
> - 同一套手写正则还吞掉了 `~~删除线~~`、`_斜体_`、`__粗体__`、自动链接、反斜杠转义、链接 title,并截断含 `)` 的 URL;`==高亮==` 只在富文本模式可用。换成 markdown-it 后一次性补齐。
>
> **行为变更**:链接目标里的**裸空格**(`![图](./a b.png)`)按 CommonMark 不再解析为图片,需写成 `<./a b.png>` 或 `./a%20b.png` —— 与富文本模式、GitHub 一致。同时修掉了 `resolveToFileUrl` 把已转义的 `%20` 二次编码成 `%2520` 的老 bug(两种模式都受益)。

## 自动化测试：CDP 端到端验证（旧，逐步被 Playwright 取代）

历史上 UI 操作层面用 **Chrome DevTools Protocol** 手动连进运行中的 Electron，真实派发鼠标/键盘事件并回读 DOM。这套方法定位了好几个隐蔽 bug，经验仍有价值(见下"关键经验")，但需手动起进程、依赖本地 fixture，正在迁移到上面的 Playwright。

### 工具

- `scripts/etv.mjs` —— 端到端验证：命中测试每个按钮、读计算样式、检测 `-webkit-app-region`、驱动块切换器/右键菜单/选区等
- `scripts/inspect.mjs` —— 简易状态检查器

### 用法

```bash
# 1) 带远程调试端口启动（注意：要先关掉别的实例，否则单实例锁会转发到旧实例）
npx electron . --remote-debugging-port=9222 "path\to\some.md"

# 2) 跑验证
node scripts/etv.mjs
```

### 关键经验（CDP 的坑）

- **响应取值路径**：`Runtime.evaluate` 的值在 `msg.result.result.value`（别写成 `msg.result.value`）
- **合成事件的局限**：
  - `Input.dispatchMouseEvent` 的合成**拖拽不驱动 ProseMirror 的 `state.selection`**（DOM 有选区但 PM 内部是空的）→ 测选区相关功能要用**键盘选区**（Shift+方向键）
  - 合成点击会**绕过 OS 级 `-webkit-app-region` 的拖拽吞噬**，所以它不能证明"真实鼠标可点"；判断拖拽区要读计算样式
  - `requestAnimationFrame` 在窗口被遮挡时被节流到几乎不触发 → 别在初始化逻辑里依赖 rAF
  - 原生监听器调 React `setState` 是异步渲染，查 DOM 前要等一拍
- `/json/new` 在新版 Chromium 被限制；要新开页面截图可直接 `Page.navigate` 现有页到目标 URL
- `System.Drawing.Icon` 读不了 PNG 内嵌的 ICO 帧（渲染噪点），验证圆角时直接渲染源 PNG

## 数据/状态约定

- 会话存于 `localStorage`，键 `easymarkdown.session.v1`：`{workspace, theme, lang, recents, sidebarOpen, sidebarMode, openPaths, activePath}`
- 首次引导标记：`localStorage['easymarkdown.onboarded.v1']`
- 主题以 `body` 的 class 表达：`light|dark` 基类 + 可选 `theme-*` 覆盖类
