// User-facing, offline help. Keep the three locales structurally aligned so a
// topic keeps the same stable id when the UI language changes or a deep link is
// opened from the status bar / command palette.

const EN_TOPICS = [
  {
    id: 'start',
    group: 'start',
    icon: 'sparkle',
    title: '3-minute quick start',
    summary: 'Open a document, make a safe edit, and save it without learning the whole app first.',
    keywords: 'beginner first run open save folder markdown',
    body: `## Your first successful edit

1. Choose **Open File** for one document, or **Open Folder** when the files belong to one project.
2. Existing Markdown opens in **Keep mode**. Read normally, then edit only the paragraph, task, or table cell you need.
3. Press **Ctrl/Cmd+S**. Keep mode preserves the rest of the source, so Git shows only the change you made.

## The three controls worth learning first

- **Ctrl/Cmd+P — Command Palette:** search files and almost every action by name.
- **Keep / Milkdown:** switch between precise source-backed editing and free-form WYSIWYG writing.
- **Rich / Source / Rich+Source:** change how the current document is viewed without changing its chosen editor.

## A useful starting habit

Open a project folder instead of opening many unrelated files one by one. The file tree, workspace search, heading search, link diagnostics, and rename updates can then work across the project.

> You never need to finish this guide before writing. Return with **F1** whenever a feature becomes relevant.`
  },
  {
    id: 'modes',
    group: 'start',
    icon: 'shield',
    title: 'Keep, Milkdown, and Source',
    summary: 'Choose the editing model that matches the job, and understand what each mode may change on disk.',
    keywords: 'keep milkdown source rich wysiwyg zero diff editor mode split',
    body: `## Keep mode: precise changes

Keep mode is the default for existing Markdown files. The original source stays authoritative and the rendered page is a safe reading surface. Edit a block, task, or table cell and only the affected source lines are replaced. This is the best choice for specifications, repositories, and any file where clean diffs matter.

Confirmed Keep edits have their own Undo/Redo history. An unfinished editor remains attached to its tab; saving or switching modes asks you to finish or cancel that draft first.

## Milkdown: free-form writing

Milkdown provides continuous WYSIWYG typing, slash commands, selection formatting, LaTeX, Mermaid, and image insertion. It is ideal for drafting a new document. Saving re-serializes the document, so whitespace, list markers, blank lines, or table alignment can change even when their meaning does not.

## Source is a view, not a third editor

Press **Ctrl/Cmd+/** to show the raw Markdown. In Keep mode the view button cycles **Rich → Source → Rich+Source**; the last option lets you compare the rendered document and source side by side. In Milkdown it cycles between Rich and Source.

Switch the editor with the **Keep / Milkdown** button in the status bar. Switch the view with the neighboring view button.`
  },
  {
    id: 'workspace',
    group: 'workflows',
    icon: 'folder',
    title: 'Files, workspaces, and tabs',
    summary: 'Manage a project in one window with a lazy file tree, previews, pinned tabs, and split panes.',
    keywords: 'files folders workspace tree tabs preview pin split rename move delete recent',
    body: `## Open a workspace

Use **Ctrl/Cmd+Shift+O** to open a folder. Multiple roots can live in the sidebar. Expand only the folders you need; EasyMarkdown watches loaded folders shallowly so large repositories remain responsive.

The tree supports mouse and keyboard work: arrows move and expand, **Enter** opens, **F2** renames, **Delete** asks before removal, and **Shift+F10** opens the context menu. You can create, duplicate, move, rename, export, reveal, or delete items from that menu.

## Preview and permanent tabs

A single click in the file tree uses one replaceable preview tab. Continue browsing and that slot is reused. Double-click or press Enter to keep the file open permanently. Editing, pinning, dragging, splitting, or changing its editor automatically promotes a preview.

Pinned tabs stay at the left and survive **Close Others**. Drag to reorder. Use **Ctrl/Cmd+Shift+T** to restore a recently closed file tab, and **Ctrl+Tab** for the recent-tab switcher.

## Work side by side

Right-click a tab and choose **Open in Split**, or use the columns button in the top bar. Each pane remains independently editable. Clicking a tab loads it into the last focused pane; close the split with the small close button between the panes.`
  },
  {
    id: 'editing',
    group: 'workflows',
    icon: 'heading',
    title: 'Writing and formatting',
    summary: 'Edit blocks safely in Keep, or use Milkdown for continuous composition and richer formatting controls.',
    keywords: 'heading paragraph list quote task highlight link code slash formatting block edit',
    body: `## Editing in Keep

Move near a paragraph, heading, list, or quote and choose **Edit content**. The editor shows the exact Markdown for that block. Confirm to replace only those lines; cancel to restore the rendered block unchanged.

Task list checkboxes can be toggled directly. Right-click a non-table block to insert a block above or below, duplicate it, or delete it. These actions also appear in the Command Palette and enter Keep Undo/Redo history.

## Editing in Milkdown

Type continuously as in a word processor. Enter **/** at the start of a line for the block menu, select text for inline formatting, or use **Ctrl/Cmd+1…6** for headings and **Ctrl/Cmd+0** for a paragraph. Links, lists, quotes, code blocks, images, formulas, and Mermaid diagrams render in place.

## Inline syntax

Both rendered modes understand bold, italic, strike-through, inline code, links, automatic URLs, ==highlights==, and line breaks. Keep shows these without rewriting the source. Milkdown may normalize their Markdown representation when saving.

If exact Markdown spelling matters, use Keep or check the raw Source view before saving.`
  },
  {
    id: 'tables',
    group: 'workflows',
    icon: 'columns',
    title: 'Tables and spreadsheet-like editing',
    summary: 'Navigate cells, paste rectangular data, filter rows, and change table structure without leaving the document.',
    keywords: 'table cell excel tsv paste filter row column enter f2 alt down',
    body: `## Select and edit a cell

In Keep, click a cell to select it. Use the arrow keys or **Tab / Shift+Tab** to move. Press **Enter** or **F2**, or double-click, to edit. Confirm a multiline edit with **Ctrl/Cmd+Enter** and cancel with **Esc**.

Copy a rectangular range from Excel or another spreadsheet and paste it into the selected cell. Values fill the existing table from that point; data outside the current rows or columns is intentionally clipped rather than silently changing the structure.

## Rows, columns, and menus

Right-click a cell or press **Shift+F10** for table actions: insert a row above/below, delete the row, insert a column left/right, or delete the column. The last remaining column is protected. The same actions are searchable in the Command Palette.

## Temporary filters

Click the arrow in a header, or press **Alt+Down**, to search and select values. Filters across columns combine with AND. The status bar shows how many rows remain; click it to clear all filters. Filtering changes display only and is never saved into Markdown.`
  },
  {
    id: 'navigation',
    group: 'workflows',
    icon: 'search',
    title: 'Find, navigate, and understand links',
    summary: 'Move through one long document or an entire workspace without losing your previous reading position.',
    keywords: 'find replace search outline command palette heading link reference rename history back forward',
    body: `## One document

Use **Ctrl/Cmd+F** for Find and **Ctrl+H** on Windows or **Option+Cmd+F** on macOS for Replace. Options include case, whole word, regular expression, and selection-only search. The mode button changes the bar into **Go to line**.

Open the Outline from the activity bar or with **Ctrl/Cmd+Shift+L**. Selecting a heading jumps to it. In the Command Palette, choose the heading scope or use the **@** accelerator to search the active document.

## The whole workspace

Use **Ctrl/Cmd+Shift+F** for content search across open workspace roots. The **#** scope in the Command Palette searches headings across files. Results open at the matching line.

## Links and navigation history

Keep opens Web and internal links with a normal click; Milkdown uses **Ctrl/Cmd+Click**. Link diagnostics find missing files or anchors. **F8 / Shift+F8** steps through problems, Find References shows incoming links, and **F2** can rename a heading with reviewed link updates.

All these jumps enter one history. Use **Alt+Left / Alt+Right** (Option on macOS), mouse side buttons, or palette commands to return to the exact previous context.`
  },
  {
    id: 'media',
    group: 'workflows',
    icon: 'image',
    title: 'Images, formulas, Mermaid, and HTML',
    summary: 'Keep documents portable while using rich media that still round-trips as Markdown source.',
    keywords: 'image assets paste drop latex math mermaid diagram html relative path',
    body: `## Images

Paste or drop an image in Milkdown. For a saved document, EasyMarkdown writes it to an **assets** folder beside the document and inserts a relative path. For an untitled document, it parks the image safely and relocates it on first save. If local persistence fails, an inline data URL is used instead of a temporary blob link.

Keep resolves relative image paths from the document location. Click an image preview to enlarge it. Moving a document separately from its assets folder can break the link, so move both together.

## Math and Mermaid

Inline math uses dollar delimiters. Display math is most reliable with the opening and closing double-dollar delimiters on their own lines. Mermaid uses a fenced code block whose language is **mermaid**; the diagram is shown by default and its toolbar reveals the source editor.

## Raw HTML

Recognized block HTML is rendered as sanitized display content while the original HTML text is retained for saving. Use Source view when you need to inspect or change the exact markup.`
  },
  {
    id: 'safety',
    group: 'workflows',
    icon: 'history',
    title: 'Saving, Undo, and local history',
    summary: 'Know what is in memory, what is on disk, and which recovery layer to use after a mistake.',
    keywords: 'save autosave dirty undo redo review local history restore close crash recovery draft',
    body: `## Save state and drafts

The status bar shows **Saved** or **Modified**. Closing a dirty tab and quitting with unsaved work both ask for confirmation. Untitled dirty tabs are kept in the session and restored after restart. In-progress Keep cell or block editors are drafts; finish or cancel them before save, mode switch, or Keep Undo/Redo.

Enable Autosave in Settings if you want confirmed content written automatically. External changes to an open file are detected and reloaded when safe.

## Three recovery layers

1. **Editor Undo/Redo** handles typing in Milkdown or Source.
2. **Keep Undo/Redo** records confirmed cell, task, block, and table transactions. Use the buttons beside Modified or **Ctrl/Cmd+Z** and **Ctrl/Cmd+Shift+Z**.
3. **Persistent Local History** is an optional desktop feature in Settings. Successful saves snapshot the previous saved content outside the document folder. Open Local History to compare and restore; restoration is itself undoable.

Use **Review Changes** in Keep before saving when you want a source-line summary or need to restore only one changed range.`
  },
  {
    id: 'appearance',
    group: 'reference',
    icon: 'sliders',
    title: 'Appearance, typography, and settings',
    summary: 'Tune the reading surface without mixing frequently adjusted layout controls with durable preferences.',
    keywords: 'theme custom typora css font width size zoom line height language settings appearance',
    body: `## Fast layout adjustments

The sliders button in the status bar contains editor width, font size, content zoom, line height, paragraph spacing, and Keep blank-line spacing. These are close to the document because they often change with reading context.

## Durable settings

Open Settings with **Ctrl/Cmd+,** for the default editor, autosave, local history, spellcheck, writing fonts, built-in or custom themes, hidden files, default file association, and UI language.

EasyMarkdown includes warm light/dark themes and four restrained Morandi palettes. Typora-compatible CSS themes can be copied into the Themes folder; refresh the list after adding files. Theme assets referenced with relative URLs are resolved from the theme location.

The writing font is chosen separately for Latin, Chinese, Japanese, and code. Documents containing kana automatically use the Japanese stack, including PDF/HTML export and printing.`
  },
  {
    id: 'shortcuts',
    group: 'reference',
    icon: 'command',
    title: 'Keyboard shortcut reference',
    summary: 'A compact reference for file, navigation, editing, view, and Keep table commands.',
    keywords: 'keyboard shortcut hotkey ctrl cmd command f1 f2 f8',
    body: `## General

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Help center | F1 | F1 |
| New / Open file | Ctrl+N / Ctrl+O | Cmd+N / Cmd+O |
| Open folder | Ctrl+Shift+O | Cmd+Shift+O |
| Save / Save As | Ctrl+S / Ctrl+Shift+S | Cmd+S / Cmd+Shift+S |
| Close / Reopen tab | Ctrl+W / Ctrl+Shift+T | Cmd+W / Cmd+Shift+T |
| Recent tab switcher | Ctrl+Tab | Ctrl+Tab |
| Command Palette | Ctrl+P | Cmd+P |
| Settings | Ctrl+, | Cmd+, |

## Search, navigation, and view

| Action | Shortcut |
| --- | --- |
| Find / Replace | Ctrl/Cmd+F · Ctrl+H (macOS: Option+Cmd+F) |
| Workspace search | Ctrl/Cmd+Shift+F |
| Sidebar / Outline | Ctrl/Cmd+B · Ctrl/Cmd+Shift+L |
| Source view | Ctrl/Cmd+/ |
| Back / Forward | Alt/Option+Left · Alt/Option+Right |
| Next / previous link problem | F8 · Shift+F8 |
| Rename heading | F2 |
| Zen mode | Ctrl/Cmd+K, then Z |

## Editing and export

| Action | Shortcut |
| --- | --- |
| Keep Undo / Redo | Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z (Windows also Ctrl+Y) |
| Heading 1…6 / paragraph in Milkdown | Ctrl/Cmd+1…6 · Ctrl/Cmd+0 |
| Edit selected Keep table cell | Enter or F2 |
| Open table filter / menu | Alt+Down · Shift+F10 |
| Export PDF / HTML | Ctrl/Cmd+Shift+E · Ctrl/Cmd+Shift+H |
| Print | Ctrl/Cmd+Alt+P |`
  },
  {
    id: 'troubleshooting',
    group: 'reference',
    icon: 'alert',
    title: 'Troubleshooting and common questions',
    summary: 'Quick checks for missing images, stale folders, large files, custom themes, and platform warnings.',
    keywords: 'faq troubleshoot image missing folder refresh large file slow theme windows smartscreen mac gatekeeper',
    body: `## An image is missing

Check that its relative path is still correct from the Markdown file and that the accompanying **assets** folder moved with the document. Source view shows the exact stored path. Re-pasting in Milkdown creates a fresh local copy.

## A collapsed folder looks stale

Folder watching is intentionally lazy. Expand the folder or use **Refresh** from its context menu to read it again. Open only real absolute workspace folders; restricted system roots are refused for safety.

## A very large document opens as source

EasyMarkdown protects responsiveness by avoiding the heavy WYSIWYG engine for unusually large or single-block documents. Keep remains available for many large Markdown files; if the rich engine was selected, a banner lets you opt in explicitly.

## A custom theme does not appear

Open the Themes folder from Settings, place the CSS file there (subfolders are allowed), then refresh themes. If the theme uses fonts or images, keep those assets beside its CSS.

## The installer is blocked

Builds are currently unsigned. Windows SmartScreen may require **More info → Run anyway**. On macOS, right-click the app and choose **Open** the first time. Download releases only from the official project page.`
  },
  {
    id: 'whats-new',
    group: 'reference',
    icon: 'sparkle',
    title: 'Highlights in this version',
    summary: 'A short tour of the capabilities that are easiest to miss after upgrading.',
    keywords: 'new release update highlights preview history links split zen',
    body: `## Safer, more visible editing

- Keep now provides explicit Undo/Redo, draft protection, a source-line change review, and partial restoration.
- Optional Persistent Local History keeps bounded save snapshots away from the document folder.
- Rich+Source shows the same Keep document in synchronized side-by-side views.

## Faster navigation

- Preview tabs make quick file-tree browsing lightweight; editing promotes them automatically.
- Recently closed tabs, the MRU tab switcher, and navigation back/forward preserve working context.
- Command Palette scopes search files, commands, current headings, workspace headings, and line numbers.
- Link diagnostics, references, and reviewed rename updates help maintain connected Markdown workspaces.

## Focus and polish

- Zen mode hides application chrome until the pointer approaches an edge.
- Table keyboard navigation, rectangular paste, filters, and structural commands reduce mouse travel.
- Typography controls live in one compact status-bar panel, while durable font and behavior choices remain in Settings.

Release-specific notes are also shown by the in-app update notice when a newer version is available.`
  }
]

const ZH_TOPICS = [
  {
    id: 'start', group: 'start', icon: 'sparkle', title: '3 分钟快速上手',
    summary: '先完成一次安全的打开、编辑与保存，不必一开始就学完整个软件。',
    keywords: '新手 首次 打开 保存 文件夹 markdown 快速开始',
    body: `## 完成第一次有效编辑

1. 只处理一篇文档时选择**打开文件**；同一项目下有多篇文档时选择**打开文件夹**。
2. 已有 Markdown 默认以**保持模式**打开。正常阅读，需要修改时只编辑目标段落、任务框或表格单元格。
3. 按 **Ctrl/Cmd+S** 保存。保持模式不会重排其他源码，因此 Git 中只会出现你真正改动的内容。

## 最先记住的三个入口

- **Ctrl/Cmd+P — 命令面板：**按名称查找文件和绝大多数操作。
- **保持 / Milkdown：**在精确的源码局部编辑与自由所见即所得写作之间切换。
- **富文本 / 源码 / 富文本+源码：**只改变当前文档的查看方式，不改变所选编辑器。

## 一个实用习惯

与其逐个打开许多相关文件，不如直接打开项目文件夹。文件树、工作区搜索、跨文件标题搜索、链接诊断和重命名更新才能覆盖整个项目。

> 不必读完整本指南再开始工作。遇到问题时随时按 **F1** 回来查询。`
  },
  {
    id: 'modes', group: 'start', icon: 'shield', title: '保持、Milkdown 与源码视图',
    summary: '根据任务选择编辑方式，并明确每种方式可能对磁盘原文产生什么影响。',
    keywords: '保持 keep milkdown 源码 富文本 所见即所得 零差分 编辑模式 分栏',
    body: `## 保持模式：只改需要改的地方

已有 Markdown 默认使用保持模式。磁盘原文始终是正本，渲染页面是安全的阅读界面。编辑内容块、任务或表格单元格时，只替换对应源码行。它最适合规范文档、Git 仓库，以及任何在意干净差分的文件。

已确认的 Keep 编辑拥有独立的撤销/重做历史。未确认的编辑框会跟随标签保留；保存或切换模式前，软件会要求先确认或取消草稿。

## Milkdown：自由写作

Milkdown 提供连续的所见即所得输入、斜杠菜单、选区格式工具、LaTeX、Mermaid 和图片插入，适合从零起草。保存时会重新序列化整篇文档，因此空白、列表符号、空行或表格对齐可能发生语义不变的变化。

## 源码只是一种视图

按 **Ctrl/Cmd+/** 查看原始 Markdown。保持模式下，视图按钮循环**富文本 → 源码 → 富文本+源码**，最后一种可并排核对渲染结果与原文；Milkdown 下在富文本与源码之间切换。

状态栏的**保持 / Milkdown**按钮切换编辑器，旁边的视图按钮切换显示方式。`
  },
  {
    id: 'workspace', group: 'workflows', icon: 'folder', title: '文件、工作区与标签页',
    summary: '用延迟加载的文件树、预览标签、固定标签和分栏，在一个窗口管理整个项目。',
    keywords: '文件 文件夹 工作区 文件树 标签 预览 固定 分栏 重命名 移动 删除 最近',
    body: `## 打开工作区

按 **Ctrl/Cmd+Shift+O** 打开文件夹。侧边栏可同时保留多个根目录。只展开正在使用的目录；EasyMarkdown 对已加载目录进行浅层监听，大型仓库也不会在启动时被完整扫描。

文件树支持完整键盘操作：方向键移动和展开，**Enter** 打开，**F2** 重命名，**Delete** 删除确认，**Shift+F10** 打开菜单。右键菜单还可新建、复制、移动、导出、在资源管理器中显示或刷新。

## 预览标签与普通标签

在文件树单击会使用唯一的可替换预览标签，继续浏览时复用这个位置；双击或按 Enter 会永久打开。开始编辑、固定、拖动、分栏或更换编辑器后，预览会自动转为普通标签。

固定标签位于左侧，不会被“关闭其他标签”误关。拖动可排序；**Ctrl/Cmd+Shift+T** 恢复最近关闭的文件标签，**Ctrl+Tab** 打开最近使用标签切换器。

## 并排工作

右键标签选择**在分栏中打开**，或点击顶栏的双栏按钮。两个面板都可独立编辑；点击标签时，它会进入最后获得焦点的面板。使用面板之间的小关闭按钮退出分栏。`
  },
  {
    id: 'editing', group: 'workflows', icon: 'heading', title: '写作与格式',
    summary: '在保持模式中做精确的块级修改，或在 Milkdown 中连续写作和排版。',
    keywords: '标题 段落 列表 引用 任务 高亮 链接 代码 斜杠菜单 格式 内容编辑',
    body: `## 在保持模式中编辑

把指针移到段落、标题、列表或引用附近，选择**内容编辑**。编辑框显示这个内容块对应的准确 Markdown；确认后只替换这些行，取消则恢复原来的渲染内容。

GFM 任务框可直接点击。右键非表格内容块，可在上方或下方插入、复制、删除；同样的动作也能从命令面板执行，并都会进入 Keep 撤销/重做历史。

## 在 Milkdown 中编辑

像文字处理器一样连续输入。行首键入 **/** 打开块菜单；选中文字可使用格式工具条；**Ctrl/Cmd+1…6** 设置标题，**Ctrl/Cmd+0** 转为正文。链接、列表、引用、代码块、图片、公式和 Mermaid 均可原位显示。

## 行内语法

两个渲染模式都能显示粗体、斜体、删除线、行内代码、链接、自动网址、==高亮== 和换行。保持模式只负责显示，不重写源码；Milkdown 保存时可能规范化 Markdown 写法。

如果符号和空白的准确形式很重要，请使用保持模式，或保存前在源码视图中核对。`
  },
  {
    id: 'tables', group: 'workflows', icon: 'columns', title: '表格与类 Excel 编辑',
    summary: '在文档内完成单元格导航、矩形粘贴、筛选和行列结构调整。',
    keywords: '表格 单元格 excel tsv 粘贴 筛选 行 列 enter f2 alt',
    body: `## 选择并编辑单元格

保持模式下，单击一个单元格进行选择。用方向键或 **Tab / Shift+Tab** 移动，按 **Enter**、**F2** 或双击进入编辑。多行编辑时用 **Ctrl/Cmd+Enter** 确认，**Esc** 取消。

可以从 Excel 等表格软件复制矩形数据并粘贴到当前单元格。数据从当前位置覆盖已有范围；超出现有行列的部分会明确截断，不会偷偷改变表格结构。

## 行、列与操作菜单

右键单元格或按 **Shift+F10** 打开表格操作：在上方/下方插入行、删除本行、在左侧/右侧插入列、删除本列。最后一列受保护。同样的动作可在命令面板中搜索。

## 临时筛选

点击表头箭头，或按 **Alt+↓**，可搜索和勾选取值。多列筛选按 AND 组合。状态栏会显示剩余行数，点击即可清除全部筛选。筛选只改变显示，绝不会写进 Markdown。`
  },
  {
    id: 'navigation', group: 'workflows', icon: 'search', title: '查找、导航与链接',
    summary: '在长文档和整个工作区之间移动，同时保留刚才的阅读位置。',
    keywords: '查找 替换 搜索 大纲 命令面板 标题 链接 引用 重命名 历史 前进 后退',
    body: `## 当前文档

使用 **Ctrl/Cmd+F** 查找；Windows 用 **Ctrl+H**、macOS 用 **Option+Cmd+F** 替换。可选择大小写、全词、正则表达式和仅选区。点击模式按钮可切换为**按行号定位**。

从活动栏打开大纲，或按 **Ctrl/Cmd+Shift+L**。点击标题即可跳转。命令面板中选择“当前文档标题”，或使用 **@** 加速前缀搜索标题。

## 整个工作区

按 **Ctrl/Cmd+Shift+F** 搜索所有已打开工作区。命令面板的 **#** 范围搜索跨文件标题，点击结果会直接定位到相应行。

## 链接与跳转历史

保持模式普通单击即可打开网页或内部链接；Milkdown 使用 **Ctrl/Cmd+单击**。链接诊断会找出缺失文件和锚点；**F8 / Shift+F8** 逐个查看问题，“查找引用”显示入站链接，**F2** 可在确认更新计划后重命名标题。

这些跳转统一进入历史。使用 **Alt+← / Alt+→**（macOS 为 Option）、鼠标侧键或命令面板，可回到准确的上一个阅读位置。`
  },
  {
    id: 'media', group: 'workflows', icon: 'image', title: '图片、公式、Mermaid 与 HTML',
    summary: '使用丰富内容，同时让文档继续保持可移植的 Markdown 原文。',
    keywords: '图片 assets 粘贴 拖放 latex 数学 公式 mermaid 图表 html 相对路径',
    body: `## 图片

在 Milkdown 中粘贴或拖入图片。已保存文档的图片会写入文档旁的 **assets** 文件夹，并插入相对路径；未命名文档会先安全暂存，在第一次保存时搬到对应位置。若本地持久化失败，则使用内联数据 URL，而不会留下重启后失效的临时 blob 链接。

保持模式会根据文档位置解析相对图片。点击预览可放大。若单独移动 Markdown 而没有同时移动 assets 文件夹，链接可能失效。

## 公式与 Mermaid

行内公式使用美元符号。块级公式最可靠的写法是让开头和结尾的双美元符号各占一行。Mermaid 使用语言为 **mermaid** 的围栏代码块；默认显示图形，通过代码块工具栏切换到源码编辑。

## 原生 HTML

可识别的块级 HTML 会以经过安全处理的真实内容显示，同时保存时仍保留原始 HTML 文本。需要检查或修改准确标记时，请切换源码视图。`
  },
  {
    id: 'safety', group: 'workflows', icon: 'history', title: '保存、撤销与本地历史',
    summary: '分清内存、磁盘与恢复层，在误操作后选择正确的找回方式。',
    keywords: '保存 自动保存 未保存 撤销 重做 审阅 本地历史 恢复 关闭 崩溃 草稿',
    body: `## 保存状态与草稿

状态栏显示“已保存”或“已修改”。关闭脏标签、退出含未保存内容的应用时都会确认。未命名且已修改的标签会保存在会话中，重启后恢复。尚未确认的 Keep 单元格或内容块属于草稿；保存、切换模式或 Keep 撤销/重做前需先确认或取消。

如需自动写盘，可在设置中开启自动保存。已打开文件的外部变化会被监测，并在安全时重新载入。

## 三层恢复机制

1. **编辑器撤销/重做**处理 Milkdown 或源码输入。
2. **Keep 撤销/重做**记录已确认的单元格、任务、内容块和表格事务；可点击“已修改”旁的按钮，或用 **Ctrl/Cmd+Z** 与 **Ctrl/Cmd+Shift+Z**。
3. **持久本地历史**是设置中的桌面端可选功能。每次成功保存时，将上一版内容快照放在文档目录之外。可在本地历史中比较和恢复，恢复本身仍可撤销。

保存前如需核对，打开**查看本次修改**，可按源码行查看摘要，或只恢复其中一个改动范围。`
  },
  {
    id: 'appearance', group: 'reference', icon: 'sliders', title: '外观、排版与设置',
    summary: '把随阅读场景调整的布局控制与长期偏好分开管理。',
    keywords: '主题 自定义 typora css 字体 宽度 字号 缩放 行距 语言 设置 外观 排版',
    body: `## 快速调整阅读布局

状态栏的滑杆按钮包含编辑区宽度、字号、内容缩放、行距、段落间距和 Keep 连续空行间距。它们经常随阅读场景变化，因此放在文档附近。

## 持久设置

按 **Ctrl/Cmd+,** 打开设置，可选择默认编辑器、自动保存、本地历史、拼写检查、写作字体、内置或自定义主题、隐藏文件、默认打开程序和界面语言。

EasyMarkdown 提供暖色亮/暗主题和四套克制的莫兰迪配色。Typora 兼容 CSS 可复制到主题文件夹，添加后刷新列表；CSS 中的相对字体和图片路径会从主题文件位置解析。

拉丁文字、中文、日文和代码可分别选择字体。含假名的文档会自动使用日文字体栈，PDF/HTML 导出与打印也保持一致。`
  },
  {
    id: 'shortcuts', group: 'reference', icon: 'command', title: '键盘快捷键速查',
    summary: '文件、导航、编辑、视图和 Keep 表格操作的集中参考。',
    keywords: '键盘 快捷键 热键 ctrl cmd command f1 f2 f8',
    body: `## 常用操作

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 帮助中心 | F1 | F1 |
| 新建 / 打开文件 | Ctrl+N / Ctrl+O | Cmd+N / Cmd+O |
| 打开文件夹 | Ctrl+Shift+O | Cmd+Shift+O |
| 保存 / 另存为 | Ctrl+S / Ctrl+Shift+S | Cmd+S / Cmd+Shift+S |
| 关闭 / 恢复标签 | Ctrl+W / Ctrl+Shift+T | Cmd+W / Cmd+Shift+T |
| 最近标签切换器 | Ctrl+Tab | Ctrl+Tab |
| 命令面板 | Ctrl+P | Cmd+P |
| 设置 | Ctrl+, | Cmd+, |

## 搜索、导航与视图

| 操作 | 快捷键 |
| --- | --- |
| 查找 / 替换 | Ctrl/Cmd+F · Ctrl+H（macOS：Option+Cmd+F） |
| 工作区搜索 | Ctrl/Cmd+Shift+F |
| 侧边栏 / 大纲 | Ctrl/Cmd+B · Ctrl/Cmd+Shift+L |
| 源码视图 | Ctrl/Cmd+/ |
| 后退 / 前进 | Alt/Option+← · Alt/Option+→ |
| 下一个 / 上一个链接问题 | F8 · Shift+F8 |
| 重命名标题 | F2 |
| 禅模式 | Ctrl/Cmd+K，然后按 Z |

## 编辑与导出

| 操作 | 快捷键 |
| --- | --- |
| Keep 撤销 / 重做 | Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z（Windows 也可 Ctrl+Y） |
| Milkdown 标题 1…6 / 正文 | Ctrl/Cmd+1…6 · Ctrl/Cmd+0 |
| 编辑选中的 Keep 表格单元格 | Enter 或 F2 |
| 打开表格筛选 / 菜单 | Alt+↓ · Shift+F10 |
| 导出 PDF / HTML | Ctrl/Cmd+Shift+E · Ctrl/Cmd+Shift+H |
| 打印 | Ctrl/Cmd+Alt+P |`
  },
  {
    id: 'troubleshooting', group: 'reference', icon: 'alert', title: '常见问题与排查',
    summary: '快速检查图片丢失、目录未刷新、大文件、自定义主题和系统安全提示。',
    keywords: '常见问题 排查 图片 丢失 文件夹 刷新 大文件 卡顿 主题 windows smartscreen mac gatekeeper',
    body: `## 图片没有显示

确认图片相对路径仍以 Markdown 文件为基准，并且移动文档时同时移动了 **assets** 文件夹。源码视图可看到实际保存的路径；在 Milkdown 中重新粘贴会创建新的本地副本。

## 折叠目录没有及时变化

文件夹监听是刻意延迟加载的。展开目录，或从右键菜单选择**刷新**即可重新读取。工作区必须是真实的绝对路径；受限系统根目录会因安全原因被拒绝。

## 超大文件自动显示源码

为保护响应速度，异常大或只有一个巨型内容块的文档不会自动进入重量级所见即所得引擎。很多大型 Markdown 仍可正常使用 Keep；若已经选择 Milkdown，提示条会让你明确决定是否强制载入富文本。

## 自定义主题没有出现

从设置打开主题文件夹，把 CSS 放入其中（允许子目录），然后刷新主题。若主题引用字体或图片，请让这些资源与 CSS 保持原有相对位置。

## 安装程序被系统阻止

当前构建尚未签名。Windows SmartScreen 可能需要选择**更多信息 → 仍要运行**；macOS 首次打开可右键应用并选择**打开**。请只从官方项目页面下载发布包。`
  },
  {
    id: 'whats-new', group: 'reference', icon: 'sparkle', title: '本版本重点功能',
    summary: '升级后最容易错过的一组能力速览。',
    keywords: '新版 更新 发布 亮点 预览 历史 链接 分栏 禅模式',
    body: `## 更安全、更可见的编辑

- Keep 提供显式撤销/重做、草稿保护、源码行级修改审阅和局部恢复。
- 可选的持久本地历史把有限数量的保存快照放在文档目录之外。
- 富文本+源码可将同一篇 Keep 文档同步并排显示。

## 更快的导航

- 预览标签让文件树快速浏览更轻量，开始编辑后自动转为普通标签。
- 已关闭标签恢复、MRU 标签切换器和前进/后退保留工作上下文。
- 命令面板可分别搜索文件、命令、当前标题、工作区标题和行号。
- 链接诊断、引用查找和经确认的重命名更新帮助维护互相关联的 Markdown。

## 专注与细节

- 禅模式隐藏应用界面，指针靠近边缘时暂时显示。
- 表格键盘导航、矩形粘贴、筛选和结构命令减少鼠标移动。
- 排版调整集中在状态栏小面板，长期字体和行为偏好留在设置中。

发现更新时，应用内更新提示还会显示该次发布的专属说明。`
  }
]

const JA_TOPICS = [
  {
    id: 'start', group: 'start', icon: 'sparkle', title: '3 分で始める',
    summary: 'すべてを覚える前に、文書を安全に開き、編集し、保存するところまで進めます。',
    keywords: '初心者 初回 開く 保存 フォルダー markdown クイックスタート',
    body: `## 最初の編集を完了する

1. 1 つの文書なら**ファイルを開く**、同じプロジェクトの文書群なら**フォルダーを開く**を選びます。
2. 既存の Markdown は**キープモード**で開きます。普通に読み、必要な段落・タスク・表セルだけを編集します。
3. **Ctrl/Cmd+S** で保存します。キープモードは残りのソースを再整形しないため、Git には実際の変更だけが表示されます。

## 最初に覚える 3 つの入口

- **Ctrl/Cmd+P — コマンドパレット：**ファイルやほぼすべての操作を名前で検索します。
- **キープ / Milkdown：**ソースを守る局所編集と、自由な WYSIWYG 執筆を切り替えます。
- **リッチ / ソース / リッチ+ソース：**エディタを変えずに現在の表示方法だけを切り替えます。

## おすすめの始め方

関連ファイルを 1 つずつ開くより、プロジェクトフォルダーを開きます。ファイルツリー、ワークスペース検索、見出し検索、リンク診断、名前変更の更新がプロジェクト全体で利用できます。

> ガイドを読み終えてから書き始める必要はありません。必要になったとき **F1** で戻れます。`
  },
  {
    id: 'modes', group: 'start', icon: 'shield', title: 'キープ、Milkdown、ソース表示',
    summary: '作業に合う編集方式を選び、各モードがディスク上の原文へ与える影響を理解します。',
    keywords: 'keep キープ milkdown ソース リッチ wysiwyg 差分ゼロ 編集モード 分割',
    body: `## キープモード：必要な箇所だけ変更

既存 Markdown の既定です。ディスク上の原文を正本とし、描画面は安全な閲覧面として働きます。ブロック、タスク、表セルを編集すると、対応するソース行だけが置換されます。仕様書、Git リポジトリ、余計な差分を避けたい文書に最適です。

確定済みの Keep 編集には専用 Undo/Redo があります。未確定の入力欄はタブに保持され、保存やモード切替の前に確定または取消を求めます。

## Milkdown：自由な執筆

連続 WYSIWYG 入力、スラッシュメニュー、選択書式、LaTeX、Mermaid、画像挿入を提供し、ゼロからの執筆に向きます。保存時に文書全体を再シリアライズするため、空白、リスト記号、空行、表の揃え方などが意味を保ったまま変化する場合があります。

## ソースは第 3 のエディタではない

**Ctrl/Cmd+/** で生の Markdown を表示します。キープでは表示ボタンが**リッチ → ソース → リッチ+ソース**を循環し、最後の表示で描画と原文を並べて確認できます。Milkdown ではリッチとソースを切り替えます。

ステータスバーの**キープ / Milkdown**でエディタを、その隣のボタンで表示を切り替えます。`
  },
  {
    id: 'workspace', group: 'workflows', icon: 'folder', title: 'ファイル、ワークスペース、タブ',
    summary: '遅延ファイルツリー、プレビュー、ピン留め、分割表示でプロジェクトを 1 画面にまとめます。',
    keywords: 'ファイル フォルダー ワークスペース ツリー タブ プレビュー ピン 分割 名前変更 移動 削除 最近',
    body: `## ワークスペースを開く

**Ctrl/Cmd+Shift+O** でフォルダーを開きます。複数のルートをサイドバーに保持できます。必要なフォルダーだけ展開してください。読み込んだ階層を浅く監視するため、大きなリポジトリでも起動時の全走査を避けられます。

ツリーはキーボードでも操作できます。矢印で移動・展開、**Enter** で開く、**F2** で名前変更、**Delete** で削除確認、**Shift+F10** でメニューを開きます。メニューから作成、複製、移動、書き出し、表示、更新も行えます。

## プレビューと通常タブ

ツリーのシングルクリックは、1 つだけの置換可能なプレビュータブを使います。ダブルクリックまたは Enter で通常タブになります。編集、ピン留め、ドラッグ、分割、エディタ変更でも自動的に通常タブへ昇格します。

ピン留めタブは左に並び、「他を閉じる」でも残ります。ドラッグで並べ替え、**Ctrl/Cmd+Shift+T** で閉じたファイルタブを復元、**Ctrl+Tab** で最近使ったタブを選びます。

## 並べて作業する

タブの右クリックから**分割で開く**、または上部の 2 列ボタンを使用します。両ペインは個別に編集でき、タブを選ぶと最後にフォーカスしたペインへ入ります。中央の閉じるボタンで分割を終了します。`
  },
  {
    id: 'editing', group: 'workflows', icon: 'heading', title: '執筆と書式',
    summary: 'キープで正確なブロック編集を行うか、Milkdown で連続執筆と書式設定を行います。',
    keywords: '見出し 段落 リスト 引用 タスク ハイライト リンク コード スラッシュ 書式 内容編集',
    body: `## キープで編集する

段落、見出し、リスト、引用に近づき、**内容を編集**を選びます。入力欄にはそのブロックの正確な Markdown が表示されます。確定すると該当行だけを置換し、取消すると元の描画へ戻ります。

GFM タスクは直接クリックできます。表以外のブロックを右クリックすると、上/下への挿入、複製、削除ができます。コマンドパレットにも同じ操作があり、Keep Undo/Redo に記録されます。

## Milkdown で編集する

ワープロのように連続入力します。行頭の **/** でブロックメニュー、文字選択で書式ツールを開きます。**Ctrl/Cmd+1…6** で見出し、**Ctrl/Cmd+0** で段落。リンク、リスト、引用、コード、画像、数式、Mermaid をその場で表示します。

## インライン記法

両方の描画モードで太字、斜体、取り消し線、インラインコード、リンク、自動 URL、==ハイライト==、改行を表示できます。キープは原文を書き換えず、Milkdown は保存時に Markdown 表現を正規化する場合があります。

記号や空白の形が重要なら、キープを使うか保存前にソース表示で確認します。`
  },
  {
    id: 'tables', group: 'workflows', icon: 'columns', title: '表とスプレッドシート風編集',
    summary: 'セル移動、矩形貼り付け、絞り込み、行列変更を文書内で行います。',
    keywords: '表 セル excel tsv 貼り付け フィルター 行 列 enter f2 alt',
    body: `## セルを選択して編集

キープでセルをクリックして選択します。矢印または **Tab / Shift+Tab** で移動し、**Enter**、**F2**、ダブルクリックで編集します。複数行入力は **Ctrl/Cmd+Enter** で確定、**Esc** で取消です。

Excel などから矩形データをコピーし、選択セルへ貼り付けられます。現在位置から既存範囲を上書きし、行列を超えたデータは明示的に切り捨てます。構造を暗黙に増やしません。

## 行・列と操作メニュー

セルを右クリック、または **Shift+F10** で表操作を開きます。上/下に行を挿入、行を削除、左/右に列を挿入、列を削除できます。最後の列は保護されます。コマンドパレットからも検索できます。

## 一時フィルター

見出しの矢印、または **Alt+↓** で値を検索・選択します。複数列は AND。ステータスバーに残った行数が表示され、クリックで全解除できます。表示だけの機能で Markdown には保存されません。`
  },
  {
    id: 'navigation', group: 'workflows', icon: 'search', title: '検索、移動、リンク',
    summary: '長い文書やワークスペース全体を移動し、直前の閲覧位置も失いません。',
    keywords: '検索 置換 アウトライン コマンドパレット 見出し リンク 参照 名前変更 履歴 戻る 進む',
    body: `## 現在の文書

**Ctrl/Cmd+F** で検索。置換は Windows の **Ctrl+H**、macOS の **Option+Cmd+F**。大文字小文字、単語、正規表現、選択範囲のみを指定できます。モードボタンで**行番号へ移動**に切り替えます。

アクティビティバーまたは **Ctrl/Cmd+Shift+L** でアウトラインを開き、見出しを選んで移動します。コマンドパレットの現在文書見出し、または **@** プレフィックスでも検索できます。

## ワークスペース全体

**Ctrl/Cmd+Shift+F** で開いているルートを横断検索します。コマンドパレットの **#** スコープはファイル横断の見出し検索です。結果から該当行へ直接移動します。

## リンクと移動履歴

キープでは通常クリック、Milkdown では **Ctrl/Cmd+クリック**で Web・内部リンクを開きます。リンク診断は欠落ファイルやアンカーを検出します。**F8 / Shift+F8** で問題を移動し、参照検索で入ってくるリンクを確認、**F2** で更新計画を確認して見出し名を変更できます。

移動は 1 つの履歴に入ります。**Alt/Option+← / →**、マウス側面ボタン、パレットコマンドで直前の文脈へ戻れます。`
  },
  {
    id: 'media', group: 'workflows', icon: 'image', title: '画像、数式、Mermaid、HTML',
    summary: 'リッチな内容を使いながら、文書を移植可能な Markdown 原文として保ちます。',
    keywords: '画像 assets 貼り付け ドロップ latex 数式 mermaid 図 html 相対パス',
    body: `## 画像

Milkdown に画像を貼り付けるかドロップします。保存済み文書では隣の **assets** フォルダーへ書き込み、相対パスを挿入します。未保存文書では安全に一時保管し、初回保存時に移動します。保存に失敗した場合も、一時 blob ではなくインライン data URL を使います。

キープは文書位置から相対画像を解決します。プレビューはクリックで拡大できます。文書だけを移動するとリンクが切れるため、assets も一緒に移動します。

## 数式と Mermaid

インライン数式はドル区切りです。ブロック数式は開始・終了の二重ドルを別々の行に置くと確実です。Mermaid は言語を **mermaid** にしたフェンスコードで、既定では図を表示し、ツールバーからソース編集へ切り替えます。

## 生 HTML

認識できるブロック HTML は安全化して実表示し、保存時は元の HTML 文字列を保持します。正確なマークアップの確認・変更にはソース表示を使います。`
  },
  {
    id: 'safety', group: 'workflows', icon: 'history', title: '保存、Undo、ローカル履歴',
    summary: 'メモリ・ディスク・復元機能を区別し、間違いに合う回復方法を選びます。',
    keywords: '保存 自動保存 未保存 undo redo レビュー ローカル履歴 復元 終了 クラッシュ 下書き',
    body: `## 保存状態と下書き

ステータスバーは「保存済み」または「変更あり」を表示します。変更タブを閉じるとき、未保存文書のあるアプリを終了するときは確認します。変更済みの無題タブはセッションに保存され、再起動後に復元されます。未確定の Keep セル／ブロック入力は下書きで、保存・モード切替・Keep Undo/Redo の前に確定または取消が必要です。

自動的にディスクへ書く場合は設定で自動保存を有効にします。開いているファイルの外部変更は監視され、安全なときに再読み込みします。

## 3 つの復元層

1. **エディタ Undo/Redo**：Milkdown またはソース入力。
2. **Keep Undo/Redo**：確定したセル、タスク、ブロック、表操作。変更ありの横のボタン、または **Ctrl/Cmd+Z** と **Ctrl/Cmd+Shift+Z**。
3. **永続ローカル履歴**：設定で有効化するデスクトップ機能。保存成功時に前の内容を文書フォルダー外へ保存します。比較・復元ができ、復元自体も Undo 可能です。

保存前の確認には**今回の変更をレビュー**を使い、ソース行ごとの概要や範囲単位の復元を行えます。`
  },
  {
    id: 'appearance', group: 'reference', icon: 'sliders', title: '外観、組版、設定',
    summary: '読書中に変えるレイアウト操作と、長期的な設定を分けて管理します。',
    keywords: 'テーマ カスタム typora css フォント 幅 サイズ ズーム 行間 言語 設定 外観',
    body: `## すぐ使うレイアウト調整

ステータスバーのスライダーボタンに、編集幅、文字サイズ、内容ズーム、行間、段落間隔、Keep の連続空行間隔があります。閲覧状況に応じて変えるため、文書の近くに置いています。

## 永続設定

**Ctrl/Cmd+,** で設定を開き、既定エディタ、自動保存、ローカル履歴、スペルチェック、執筆フォント、内蔵／カスタムテーマ、隠しファイル、既定アプリ、UI 言語を変更します。

暖色のライト／ダークと 4 種のモランディテーマを内蔵しています。Typora 互換 CSS はテーマフォルダーへコピーして一覧を更新します。CSS の相対フォント・画像はテーマ位置から解決されます。

ラテン、中国語、日本語、コードのフォントを個別に選べます。仮名を含む文書は日本語スタックになり、PDF/HTML 書き出しと印刷も同じです。`
  },
  {
    id: 'shortcuts', group: 'reference', icon: 'command', title: 'キーボードショートカット',
    summary: 'ファイル、移動、編集、表示、Keep 表操作の一覧です。',
    keywords: 'キーボード ショートカット ホットキー ctrl cmd command f1 f2 f8',
    body: `## 一般

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| ヘルプセンター | F1 | F1 |
| 新規 / ファイルを開く | Ctrl+N / Ctrl+O | Cmd+N / Cmd+O |
| フォルダーを開く | Ctrl+Shift+O | Cmd+Shift+O |
| 保存 / 名前を付けて保存 | Ctrl+S / Ctrl+Shift+S | Cmd+S / Cmd+Shift+S |
| タブを閉じる / 復元 | Ctrl+W / Ctrl+Shift+T | Cmd+W / Cmd+Shift+T |
| 最近のタブ | Ctrl+Tab | Ctrl+Tab |
| コマンドパレット | Ctrl+P | Cmd+P |
| 設定 | Ctrl+, | Cmd+, |

## 検索、移動、表示

| 操作 | ショートカット |
| --- | --- |
| 検索 / 置換 | Ctrl/Cmd+F · Ctrl+H（macOS：Option+Cmd+F） |
| ワークスペース検索 | Ctrl/Cmd+Shift+F |
| サイドバー / アウトライン | Ctrl/Cmd+B · Ctrl/Cmd+Shift+L |
| ソース表示 | Ctrl/Cmd+/ |
| 戻る / 進む | Alt/Option+← · Alt/Option+→ |
| 次 / 前のリンク問題 | F8 · Shift+F8 |
| 見出し名を変更 | F2 |
| Zen モード | Ctrl/Cmd+K、続けて Z |

## 編集と書き出し

| 操作 | ショートカット |
| --- | --- |
| Keep Undo / Redo | Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z（Windows は Ctrl+Y も可） |
| Milkdown 見出し 1…6 / 段落 | Ctrl/Cmd+1…6 · Ctrl/Cmd+0 |
| 選択した Keep 表セルを編集 | Enter または F2 |
| 表フィルター / メニュー | Alt+↓ · Shift+F10 |
| PDF / HTML 書き出し | Ctrl/Cmd+Shift+E · Ctrl/Cmd+Shift+H |
| 印刷 | Ctrl/Cmd+Alt+P |`
  },
  {
    id: 'troubleshooting', group: 'reference', icon: 'alert', title: 'よくある質問と対処',
    summary: '画像、フォルダー更新、大きな文書、カスタムテーマ、OS 警告を確認します。',
    keywords: 'faq トラブル 画像 見つからない フォルダー 更新 大きい 遅い テーマ windows smartscreen mac gatekeeper',
    body: `## 画像が表示されない

Markdown ファイルから見た相対パスと、文書と一緒に **assets** フォルダーを移動したか確認します。ソース表示で保存済みのパスを確認できます。Milkdown へ貼り直すと新しいローカルコピーを作ります。

## 折りたたんだフォルダーが古い

フォルダー監視は意図的に遅延しています。展開するか、コンテキストメニューの**更新**で再読み込みします。ワークスペースには実在する絶対パスが必要で、制限されたシステムルートは安全のため拒否されます。

## 大きな文書がソースで開く

応答性を守るため、非常に大きい文書や巨大な単一ブロックを重い WYSIWYG へ自動投入しません。多くの大きな Markdown は Keep で利用できます。Milkdown を選んだ場合は、バナーから明示的にリッチ読み込みを選べます。

## カスタムテーマが出ない

設定からテーマフォルダーを開き、CSS を配置（サブフォルダー可）して一覧を更新します。フォントや画像を参照するテーマは、CSS との相対位置を保ちます。

## インストーラーが OS に止められる

現在のビルドは未署名です。Windows SmartScreen は**詳細情報 → 実行**、macOS は初回にアプリを右クリックして**開く**を選びます。公式プロジェクトページからのみ取得してください。`
  },
  {
    id: 'whats-new', group: 'reference', icon: 'sparkle', title: 'このバージョンの注目機能',
    summary: 'アップグレード後に見落としやすい機能を短く紹介します。',
    keywords: '新機能 更新 リリース プレビュー 履歴 リンク 分割 zen',
    body: `## より安全で見える編集

- Keep に明示的 Undo/Redo、下書き保護、ソース行ごとの変更レビュー、部分復元があります。
- 任意の永続ローカル履歴は、上限付き保存スナップショットを文書フォルダー外に保管します。
- リッチ+ソースで同じ Keep 文書を同期して並べられます。

## より速い移動

- プレビュータブでツリー閲覧を軽くし、編集開始時に通常タブへ昇格します。
- 閉じたタブの復元、MRU タブ、戻る／進むが作業文脈を保ちます。
- コマンドパレットはファイル、コマンド、現在／全体の見出し、行番号を検索します。
- リンク診断、参照検索、確認付き名前変更が Markdown のつながりを保ちます。

## 集中と仕上げ

- Zen モードは UI を隠し、ポインターが端へ近づくと一時表示します。
- 表のキーボード移動、矩形貼り付け、フィルター、構造操作でマウス移動を減らします。
- 組版操作はステータスバーへ、長期的なフォント・動作設定は設定画面へ分けました。

新しいリリースが見つかると、アプリ内の更新通知にリリース固有の説明も表示されます。`
  }
]

const HELP_BY_LANG = {
  en: EN_TOPICS,
  zh: ZH_TOPICS,
  ja: JA_TOPICS
}

export function getHelpTopics(lang) {
  return HELP_BY_LANG[lang] || HELP_BY_LANG.en
}

function plainText(value) {
  return String(value || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[|>*_~`#]/g, ' ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(value) {
  return plainText(value).normalize('NFKC').toLocaleLowerCase()
}

function excerptFor(topic, firstTerm) {
  const source = plainText(`${topic.summary} ${topic.body}`)
  const normalized = source.normalize('NFKC').toLocaleLowerCase()
  const at = Math.max(0, normalized.indexOf(firstTerm))
  const start = Math.max(0, at - 42)
  const end = Math.min(source.length, at + firstTerm.length + 76)
  return `${start ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`
}

// Pure and unit-tested: all query terms must match somewhere in a topic. Title
// and explicit keywords rank above summary/body hits, while source order is the
// stable tie-breaker.
export function searchHelpTopics(topics, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return topics.map((topic) => ({ topic, score: 0, excerpt: '' }))

  return topics
    .map((topic, index) => {
      const title = normalize(topic.title)
      const keywords = normalize(topic.keywords)
      const summary = normalize(topic.summary)
      const body = normalize(topic.body)
      let score = 0
      for (const term of terms) {
        if (!title.includes(term) && !keywords.includes(term) && !summary.includes(term) && !body.includes(term)) {
          return null
        }
        if (title.includes(term)) score += title === term ? 100 : 60
        if (keywords.includes(term)) score += 35
        if (summary.includes(term)) score += 18
        if (body.includes(term)) score += 6
      }
      return { topic, score, excerpt: excerptFor(topic, terms[0]), index }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ index: _index, ...entry }) => entry)
}
