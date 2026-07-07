# EasyMarkdown

[![CI](https://github.com/cycyeasy1-svg/EasyMarkdown/actions/workflows/ci.yml/badge.svg)](https://github.com/cycyeasy1-svg/EasyMarkdown/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cycyeasy1-svg/EasyMarkdown?include_prereleases)](https://github.com/cycyeasy1-svg/EasyMarkdown/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.en.md) · **简体中文**

一款温暖、现代的 **Markdown 编辑器**：左侧文件树装下整个文件夹，每个文档都是同一
窗口里的一个标签页；写作时既可以用干净的所见即所得，也可以用 EasyMarkdown 独有的
**保持模式** —— 渲染归渲染，保存时对你的原文**零差分**，一个字符都不重排。

> 📜 **关于本项目**：EasyMarkdown 基于开源项目
> [horseMD](https://github.com/BND-1/horseMD)（作者 Evan Yang / 杨庭毅，MIT 协议）
> **二次开发**。在继承其单窗口多标签、所见即所得编辑等基础之上，本项目新增了
> **保持模式（零差分编辑）**、**VS Code 扩展**、**日文排版支持**、**工作区全文搜索**
> 等一系列能力，并作为独立产品持续维护 —— 差异详见下文「[相对原项目的新特性](#-easymarkdown-相对原项目的新特性)」。
> 原始版权与署名依 MIT 协议保留在 [LICENSE](./LICENSE) 与 [NOTICE.md](./NOTICE.md)，应用内「关于」处亦保留原作者署名。

![EasyMarkdown —— 文件夹工作区、标签页与所见即所得实时渲染](./docs/screenshots/hero_light.png)

## 为什么是 EasyMarkdown

大多数 Markdown 编辑器逼你做两次二选一：要么漂亮的所见即所得，要么真正的多文件
工作流；要么顺滑的编辑体验，要么保住文件原有的格式。EasyMarkdown 全都要：
**单窗口**装下整个文件夹的文件树、每个文档都是一个**标签页**；富文本模式基于
[Milkdown](https://milkdown.dev/)（ProseMirror）原地实时预览，**保持模式**则以你的
原文为正本、保存零差分。一套代码同时跑在 **Windows 和 macOS** 上，界面
**中 / 英 / 日**三语实时可切。

## ✨ EasyMarkdown 相对原项目的新特性

以下能力是 EasyMarkdown 在 horseMD 基础上独立开发的，也是两个项目的主要区别：

**保持模式 —— 源码保真的零差分编辑器（`.md` 默认打开方式）**

- 所见即所得引擎（Typora / Milkdown 一类）保存时会**整篇重写**你的文件：列表缩进、
  空行、转义、表格对齐都可能被重排。保持模式反其道而行：渲染只是视图，
  **以原文为正本，保存零差分** —— 特别适合被 Git 管理、或需要与他人协作的文档
- 块级**内容编辑** —— 单击一个块直接改内容，或「在此打开源码」只编辑那一段源码
- **表格重度增强** —— 列筛选（值搜索 / 全选反选 / 多表筛选徽章 / 一键清除本表或全文档筛选）、
  行列插入删除、按单元格 / 行 / 列 / 整表复制、宽表浮动表头
- **标题折叠**、GFM 任务列表、YAML frontmatter 渲染成结构化卡片
- 状态栏一键在**保持 ⇄ Milkdown** 之间切换，按文档记忆；Mermaid 渲染两种模式共享缓存，切换秒开

**VS Code 扩展**（[`packages/vscode-extension`](./packages/vscode-extension)）

- 把保持模式带进 VS Code：作为 Markdown 编辑器使用，支持图片粘贴、链接跳转、
  与源码的滚动同步、查找替换、表格列筛选、标题折叠、大纲

**日文排版支持**

- 界面与原生菜单 **中 / 英 / 日** 三语（原项目为中 / 英双语）
- 含假名的文档自动切换**日文字体栈**，汉字按日文字形渲染 —— 编辑器、保持模式、
  PDF / HTML 导出、打印全链路生效

**工作区与工程化**

- **工作区全文搜索**（`Ctrl/Cmd+Shift+F`）—— 跨文件搜索、按文件分组、边搜边出
- **多根工作区** —— 同时挂多个文件夹
- **源码模式行号与折叠**、大文档加载骨架屏
- 自动保存、标签固定、系统打印、HTML 导出、统一设置面板等一批 UX 打磨
- 大文档性能专项（渲染节流、启动提速、输入零卡顿），并补齐 ESLint、vitest 单元测试、
  Playwright E2E 的完整工程化体系

## 功能

**编辑 —— Typora 有的都有**

- 流畅的**所见即所得实时预览** —— 输入 Markdown，原地渲染
- 行首 `/` 斜杠菜单插入块；智能列表、选中工具条、链接悬浮提示
- 表格（**单元格内可换行**）、**带语法高亮的代码块**、**LaTeX 数学公式**、**Mermaid 图表**、图片、任务列表、引用块
- **图片本地落地** —— 粘贴 / 拖入 / 上传图片自动写入文档同目录的 `assets/`（类 Typora），不会刷新即失效
- **源码模式**切换（`Ctrl/Cmd+/`）查看原始 Markdown —— 保持滚动位置
- **纯文本文件（`.txt`）用快速纯文本编辑器打开** —— 不走 Markdown 重排，大文件秒开
- 富文本复制（带内联样式）—— 粘到公众号 / 邮件 / Notion 也能保留格式
- **导出为 PDF**（`Ctrl/Cmd+Shift+E`）—— 排版干净，不带编辑器控件
- **导出为 HTML**（`Ctrl/Cmd+Shift+H`）—— 自包含单文件（本地图片内嵌），发邮件 / 移动都不丢图
- **系统打印**（`Ctrl/Cmd+Alt+P`）—— 同一套干净排版直接走系统打印对话框
- **拼写检查**（可选，默认关）—— 设置里开关，右键给出建议词 / 加入词典
- 相对路径图片按文件所在目录解析（仅显示用，不改动你的文件内容）
- **双击图片放大查看**（灯箱预览，点背景 / Esc 关闭；单击仍可选中图片、加说明）
- **原生 HTML 表格**（文档里直接写的 `<table>…</table>`）渲染成真正的表格，和 Typora 一样 —— 仅显示，源码原样保留
- 跟随光标的**浮动块级标记**（H1…H6 / 正文）

**超出 Typora**

- **标签页** —— 多文件同窗（`Ctrl/Cmd+Tab` 循环切换）；顶栏一个 `+` 快速新建文档；**拖拽重排、右键固定**（固定标签置左、不被"关闭其他"波及、重启后保持）；标签右键可复制路径 / 复制文件名 / 打开所在文件夹 / 关闭其他
- **分屏** —— 两个文档左右并排、都可编辑（标签右键"在右侧分屏打开"或顶栏分屏按钮，右上 ✕ 关闭）
- **自定义页面宽度** —— 状态栏分段预设（窄/中/宽/全宽）+ 微调滑块
- **自定义主题** —— 把 `.css` 丢进主题文件夹即可，**可直接迁移 Typora 主题**
- **未保存草稿不丢** —— 新建但没保存的临时文档，关掉再开也还在
- **文件夹工作区** —— 文件树，原地新建 / 重命名 / 复制一份 / 删除 / 在访达中显示 / 导出 PDF，支持**拖拽移动**与展开全部 / 折叠全部
- **在同一窗口打开** —— 双击文件 → 加一个标签；对文件夹"用 EasyMarkdown 打开" → 作为工作区打开
- **命令面板**（`Ctrl/Cmd+P`）—— 模糊跳转到任意文件或命令
- **工作区全文搜索**（`Ctrl/Cmd+Shift+F`）—— 跨文件搜索内容，结果按文件分组、命中词高亮、边搜边出，点击直达那一行（支持大小写 / 整词 / 正则）
- **文档内查找 & 替换**（`Ctrl/Cmd+F` / `Ctrl+H`，macOS 替换为 `⌥⌘F`）—— 高亮匹配、实时计数，支持替换当前 / 全部替换（大小写 / 整词 / 正则同样生效）
- **大纲面板**（`Ctrl+Shift+L`）—— 点标题即跳转
- 实时字数 / 字符数与阅读时长
- 会话恢复 —— 重新打开你的文件夹和标签
- 文件树与打开的文件自动刷新 —— 监听外部改动
- **主页按钮**（活动栏）—— 随时回到欢迎页（已打开的标签仍保持加载）
- **统一设置面板**（`Ctrl/Cmd+,`，状态栏齿轮 / 命令面板均可打开）—— 排版、外观、语言、编辑偏好一处调完
- **自动保存**（可选，默认关）—— 已保存文件停止输入约 2 秒后自动写盘，永不覆盖外部冲突修改
- **Markdown 默认编辑器可选** —— 新标签默认进保持模式还是富文本，设置里一键切换
- **最近文件可管理** —— 欢迎页列表支持固定置顶 / 单项移除 / 一键清空
- **界面菜单跟随语言** —— 应用菜单随界面语言（中 / 英 / 日）实时切换
- **大文档加载骨架屏** —— 打开大文件不再是一段空白
- 关闭窗口 / 退出时提醒未保存（不只是关标签）
- 仅通知的更新检查 —— 有新版本时提示**并展示更新内容**（不自动下载）

命令面板 —— 模糊跳转到任意文件或命令：

![命令面板](./docs/screenshots/command_palette.png)

## 主题

六套精心调过的主题 —— 暖光 / 暖夜，外加四套低饱和的**莫兰迪**配色 ——
`Ctrl+Shift+T` 或状态栏选择器切换。

| 暖光 | 暖夜 | 莫兰迪·暮 |
| :---: | :---: | :---: |
| ![暖光](./docs/screenshots/hero_light.png) | ![暖夜](./docs/screenshots/theme_dark.png) | ![莫兰迪·暮](./docs/screenshots/theme_morandi_dusk.png) |
| **莫兰迪·灰绿** | **莫兰迪·豆沙** | **莫兰迪·雾蓝** |
| ![莫兰迪·灰绿](./docs/screenshots/theme_morandi_sage.png) | ![莫兰迪·豆沙](./docs/screenshots/theme_morandi_rose.png) | ![莫兰迪·雾蓝](./docs/screenshots/theme_morandi_mist.png) |

## 快捷键

| 操作               | 快捷键                        |
| ------------------ | ----------------------------- |
| 新建文件           | `Ctrl/Cmd+N`                  |
| 打开文件           | `Ctrl/Cmd+O`                  |
| 打开文件夹         | `Ctrl/Cmd+Shift+O`            |
| 保存 / 另存为      | `Ctrl/Cmd+S` / `…+Shift+S`    |
| 导出为 PDF         | `Ctrl/Cmd+Shift+E`            |
| 导出为 HTML        | `Ctrl/Cmd+Shift+H`            |
| 打印               | `Ctrl/Cmd+Alt+P`              |
| 设置               | `Ctrl/Cmd+,`                  |
| 关闭标签           | `Ctrl/Cmd+W`                  |
| 命令面板           | `Ctrl/Cmd+P`                  |
| 文档内查找         | `Ctrl/Cmd+F`                  |
| 查找并替换         | `Ctrl+H`（macOS `⌥⌘F`）       |
| 工作区全文搜索     | `Ctrl/Cmd+Shift+F`            |
| 切换侧边栏         | `Ctrl/Cmd+B`                  |
| 切换大纲           | `Ctrl+Shift+L`                |
| 切换源码模式       | `Ctrl/Cmd+/`                  |
| 切换主题           | `Ctrl+Shift+T`                |
| 循环标签           | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

## 安装

去 [**Releases 页面**](https://github.com/cycyeasy1-svg/EasyMarkdown/releases/latest) 下载最新版安装包。

> ℹ️ 安装包目前**没有花钱买签名**，所以 Windows / macOS 第一次打开都会拦一下——**不是病毒、不是真的损坏**，按下面步骤放行即可。代码完全开源，可自行查看 / 构建。

### 🍎 macOS 安装（新手请按这个来）

1. 确认你的芯片：左上角 **苹果菜单 →「关于本机」**：
   - 看到 **「Apple M1 / M2 / M3…」**（Apple Silicon）→ 下载 **`EasyMarkdown-x.x.x-arm64.dmg`**。
   - 看到 **「Intel」** → 下载 **`EasyMarkdown-x.x.x.dmg`**（不带 `-arm64` 后缀的那个）。
2. 双击下载好的 `.dmg`，把里面的 **EasyMarkdown 图标拖到「应用程序」文件夹**。
3. **第一次打开**（重要）：直接双击通常会提示 **「已损坏，无法打开」或「无法验证开发者」**——这是因为没签名，正常现象。任选一种方法放行：

   - **方法 A（最简单，推荐）**：打开「访达 →『应用程序』」，找到 EasyMarkdown，**按住 Control 键点它（或右键）→ 选「打开」**，在弹窗里再点一次 **「打开」**。之后就能像普通软件一样双击使用了。
   - **方法 B（如果方法 A 仍提示「已损坏」）**：打开「**终端**」（在「启动台 → 其他 → 终端」，或 Spotlight 搜 `终端`），把下面这行**整段复制粘贴进去、按回车**：

     ```bash
     xattr -cr /Applications/EasyMarkdown.app
     ```

     然后再回到「应用程序」双击 EasyMarkdown 即可正常打开。

> 这一步**每台电脑只需做一次**，以后更新版本一般也不用再弄。

### 🪟 Windows 安装

1. 下载 **`EasyMarkdown-Setup-x.x.x.exe`**，双击运行。
2. 若弹出蓝色的 **SmartScreen**「Windows 已保护你的电脑」，点 **「更多信息」→「仍要运行」**。
3. 按提示安装（可以自己选安装目录），完成后从开始菜单或桌面打开。

> 签名与公证在计划中 —— 见 [CHANGELOG](./CHANGELOG.md)。

## 反馈 & 支持

- 🐛 **报 bug / 提需求**：[GitHub Issues](https://github.com/cycyeasy1-svg/EasyMarkdown/issues)（需要附带的信息见 [SUPPORT.md](./SUPPORT.md)）
- 🔒 **安全问题**：请勿公开提 Issue，按 [SECURITY.md](./SECURITY.md) 私下报告
- ⭐ 觉得好用的话，点个 Star 就是对项目最大的支持

## 开发

```bash
npm install        # 若 Electron 二进制下载被墙，先设镜像：
                   #   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev        # 热重载开发模式
npm run build      # 构建 main + preload + renderer 到 out/
npm start          # 运行构建产物
npm run dist       # 按当前系统出包（Windows NSIS / macOS dmg+zip）
```

用 AI 助手在本仓库里干活？从 [CLAUDE.md](./CLAUDE.md) 开始。

## 技术栈

Electron + Vite + React 外壳，编辑器引擎用 **Milkdown Crepe**（基于 ProseMirror）。
外壳（标签页、文件树、命令面板、大纲、主题、多语言）全部自研。架构、功能实现、
踩坑与决策记录见 [`docs/`](./docs/README.md)。

## 文档

- [ROADMAP.md](./ROADMAP.md) —— 已完成 / 近期计划 / 远期(含安卓、iOS 移动端)
- [docs/architecture.md](./docs/architecture.md) —— 技术栈、进程模型、目录结构、数据流
- [docs/features.md](./docs/features.md) —— 每个功能的用法与实现（对应到文件）
- [docs/implementation-notes.md](./docs/implementation-notes.md) —— 关键 bug 的根因与修法、设计决策
- [docs/development.md](./docs/development.md) —— 开发、构建、Windows/macOS 打包、CDP 自动化测试
- [docs/release.md](./docs/release.md) —— 正式发布前检查清单
- [PRIVACY.md](./PRIVACY.md) / [SUPPORT.md](./SUPPORT.md) / [NOTICE.md](./NOTICE.md)

## 贡献

欢迎提 Issue 和 PR —— 见 [CONTRIBUTING.md](./CONTRIBUTING.md)。发现安全问题？
请通过 [SECURITY.md](./SECURITY.md) 私下报告。

## 许可证与致谢

[MIT](./LICENSE) © Easy Chen。

EasyMarkdown 源自开源项目 [BND-1/horseMD](https://github.com/BND-1/horseMD)
（© 杨庭毅 / Evan Yang，MIT 协议），感谢原作者的出色工作。依 MIT 协议要求，
原始版权与许可声明完整保留在 [LICENSE](./LICENSE) 与 [NOTICE.md](./NOTICE.md)，
应用内「关于」处也保留了原作者署名。
