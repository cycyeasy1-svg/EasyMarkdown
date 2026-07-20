// First-run guide, shown as the first tab after install — and also written to
// the program directory as README.md at package time (scripts/gen-readme.mjs).
// Positioned as a usage guide; the focus is "keep mode" (source-backed, zero-diff
// editing), which is the day-to-day editing experience for `.md` files.
//
// NOTE: keep mode renders a paragraph's source lines joined with <br>, so each
// paragraph / list item MUST stay on ONE physical line here — a hard wrap would
// show up as a visible line break. Let the editor soft-wrap on screen.

const EN = `# EasyMarkdown — User Guide 📝

**EasyMarkdown** is a warm, Typora-style **Markdown editor**. Every file opens as a **tab in one window**, not a new app. Browse a whole folder in the sidebar, flip between files in tabs, and edit \`.md\` in **keep mode** — a source-backed editor that saves a *zero-diff* result (only the bytes you actually changed).

> This guide also ships as \`README.md\` in the program folder. Edit this tab or close it — it won't appear again on the next launch.

## Two editor modes and source view

\`.md\` / \`.markdown\` / \`.mdx\` open in **keep mode by default**. \`.txt\` and very large files open in a plain-text editor.

- **Keep mode (default)** — the original file text *is* the source of truth. Rendering is read-only; you edit in place, one spot at a time, and saving never re-formats the rest. Built for Markdown specs tracked in Git, where stray diffs are not acceptable.
- **Milkdown mode** — the most free-form WYSIWYG typing (slash menu, formatting toolbar, LaTeX, Mermaid, image preview), great for drafting from scratch. **Trade-off: on save it re-serializes the whole document, so it may change the original formatting** — whitespace, list markers \`-\`/\`*\`, blank lines, table alignment — and cannot guarantee a zero diff. That is exactly why \`.md\` defaults to keep mode. Switch with the **Keep / Milkdown** button at the bottom-right, or the command palette (\`Ctrl+P\` → *Toggle Editor Mode*). Switching back to keep mode warns you about unsaved changes, since the re-flowed text would be carried over.

Keep and Milkdown are the two **editor modes**. **Source view** (\`Ctrl+/\`) is a raw-text view of the active document, not a third editor mode; opening or closing it does not change the tab's selected editor.

## Keep mode: editing (the important part)

- **Edit a table cell** — click to select, move with arrows or \`Tab\`, and press \`Enter\` / \`F2\` (double-click still works). In the multi-line editor, \`Ctrl/Cmd+Enter\` confirms and \`Esc\` cancels. \`Alt+↓\` opens the column filter; \`Shift+F10\` opens table actions.
- **Edit content (block source)** — for a paragraph, heading, list or quote, click the **Edit content** button at the block's top-right, change the raw text in the box, and confirm. Only that block's lines are replaced.
- **Tasks and block structure** — click a GFM task checkbox to toggle \`[ ]\` / \`[x]\`. Right-click a non-table block to insert above/below, duplicate, or delete it; the same actions are in the command palette.
- **Add / remove table rows & columns** — *right-click* a cell: insert row above / below, delete row, insert column left / right, delete column (the last column is protected).
- **Excel-style column filter** — click the **▼** on a column header, then check values or search to temporarily hide rows. Multiple columns combine with AND; the status bar shows \`Filtered X/Y\` — click it to clear every filter at once (right-click a table to clear just that one). **Display only — it never touches the file or affects saving.**
- **Undo / redo confirmed edits** — cell, task, block, block-structure, and table row/column changes are recorded as Keep transactions. Use \`Ctrl/Cmd+Z\`, \`Ctrl/Cmd+Shift+Z\` (or \`Ctrl+Y\` on Windows), or the explicit buttons beside **Modified** in the status bar.
- **Draft protection** — an unconfirmed cell or block editor stays with its tab when you switch away and is restored when you return. Saving, switching editor mode, or running Keep undo/redo asks you to confirm or cancel that draft first.
- **Review before saving** — **View current changes** compares the document with its last saved version, jumps to each changed source range, and can restore only the selected range. External-file conflicts offer the same read-only comparison before you decide.
- **Zero-diff save** — no re-formatting, no whitespace/bullet/quote churn, line endings preserved (mixed LF/CRLF kept as-is). \`git diff\` shows exactly the edits you made and nothing else.

Keep mode renders headings, paragraphs, lists, tables, ordinary code blocks, quotes, horizontal rules, YAML frontmatter, relative-path images, \`\`\`mermaid diagrams, and block \`$$…$$\` formulas. Inline formatting includes **bold**, *italic*, ~~strikethrough~~, \`code\`, links, autolinks, ==highlights== and \`<br>\`. GFM task checkboxes can be toggled directly. Mermaid, formula, and image previews can be enlarged. Milkdown is still the mode for slash commands and free-form WYSIWYG editing.

Cycle the status-bar view button to **Source + Keep** to edit raw Markdown beside its live Keep rendering. You can swap sides, pin the preview, and synchronize scrolling without creating a second copy of the document.

## General features

- **Tabs** — a single click in the file tree uses one replaceable preview tab; editing or double-clicking keeps it open. \`Ctrl+Tab\` shows recently used tabs, and \`Ctrl+Shift+T\` reopens the last closed file. Tabs remain reorderable and pinnable; overflow arrows appear only when the strip is full.
- **Folder workspace** — the file tree supports arrow keys, Enter, F2, Delete, Shift+F10, cut and paste. Turn on **Show hidden files** when dotfiles should appear; \`.git\` and \`node_modules\` remain excluded. Refresh a collapsed folder to rescan it.
- **Command palette** (\`Ctrl+P\`) — choose a scope for files, commands, current/workspace headings, line numbers, or help. The \`>\`, \`@\`, \`#\`, \`:\`, and \`?\` prefixes remain available for quick scope changes.
- **Outline panel** — click a heading to jump; follows your edits live.
- **Find / Replace** (\`Ctrl+F\` / \`Ctrl+H\`) — search and replace (one or all), or click the mode button to switch to **Go to line** and jump by line number.
- **Workspace search** (\`Ctrl+Shift+F\`) — search across every file in the open folder, with case-sensitive, whole-word and regex options; click a hit to jump straight to that line.
- **Navigation history** — outline, link, search-result, line-number, file, and tab jumps enter one back/forward history. Use \`Alt+←\` / \`Alt+→\` (Option on macOS), mouse side buttons, or the command palette to return to the previous document position.
- **Settings panel** (\`Ctrl+,\`) — editing, fonts, appearance, language and system options in one place. Choose English, Chinese, Japanese and code fonts; turn on autosave, spellcheck, hidden files, or the opt-in **Persistent local history**, which keeps bounded previous versions only on this device.
- **Typography and focus** — the status-bar layout control gathers page width, font size, zoom, line height and paragraph spacing. \`Ctrl/Cmd+K\`, then \`Z\`, enters Zen mode without unloading the editor.
- **Export & print** — PDF (\`Ctrl+Shift+E\`), HTML (\`Ctrl+Shift+H\`, a self-contained single file with images embedded), and system print (\`Ctrl+Alt+P\`).
- **Themes** — Warm Light / Dark plus four **Morandi** palettes (Sage, Rose, Mist, Dusk), and Typora-compatible custom \`.css\` themes.
- **Languages** — English / 中文 / 日本語, switchable anytime (bottom-right); the app menu follows along.
- **Japanese typography** — a document containing kana switches to a Japanese font stack, so its kanji render with Japanese glyph forms; PDF/HTML export and printing do the same.
- **Images** — paste or drop an image in Milkdown mode and it is saved into an \`assets/\` folder next to the document, inserted as a relative path.
- **Attachments** — **Attach Files…** copies selected files beside a saved document and inserts portable relative links.
- **Links** — in Keep, plain-click a web link to open it and an internal document link to jump in-app; in Milkdown, use \`Ctrl/Cmd+Click\`. Link diagnostics, references and rename previews help keep workspace links valid.
- **Help center** — press \`F1\` for searchable English, Chinese and Japanese guidance, shortcuts, workflows and troubleshooting.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Help center | \`F1\` |
| New file | \`Ctrl+N\` |
| Open file / folder | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| Save / Save As | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| Close tab | \`Ctrl+W\` |
| Cycle tabs | \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` |
| Keep undo / redo | \`Ctrl/Cmd+Z\` / \`Ctrl/Cmd+Shift+Z\` (Windows: \`Ctrl+Y\`) |
| Navigation back / forward | \`Alt+←\` / \`Alt+→\` |
| Command palette | \`Ctrl+P\` |
| Find / Replace in file | \`Ctrl+F\` / \`Ctrl+H\` |
| Search the workspace | \`Ctrl+Shift+F\` |
| Settings | \`Ctrl+,\` |
| Export PDF / HTML | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| Print | \`Ctrl+Alt+P\` |
| Toggle sidebar / outline | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| Toggle source view | \`Ctrl+/\` |
| Reopen closed tab | \`Ctrl+Shift+T\` |

> On macOS most \`Ctrl\` shortcuts use \`⌘\`. Tab cycling remains \`Ctrl+Tab\`, navigation history uses \`⌥+←/→\`, and Replace is \`⌥⌘F\`.

Happy writing! ✨
`

const ZH = `# EasyMarkdown 使用说明 📝

**EasyMarkdown** 是一款温暖的 Typora 风 **Markdown 编辑器**。每个文件都在同一个窗口里作为**标签页**打开，而不是新开一个程序。在侧边栏浏览整个文件夹，用标签页切换文件，并以**保持模式**编辑 \`.md\` —— 一种以原文为正本的编辑方式，保存结果**零差分**（只改你真正动过的字节）。

> 这份说明也会随安装包放到程序目录下的 \`README.md\`。你可以编辑本页或直接关掉它 —— 下次启动不会再出现。

## 两种编辑模式与源码视图

\`.md\` / \`.markdown\` / \`.mdx\` **默认用保持模式**打开；\`.txt\` 和超大文件用纯文本编辑器打开。

- **保持模式（默认）** —— 文件原文**就是正本**。渲染只用于显示，编辑是逐处进行的，保存绝不会重排其余内容。专为用 Git 管理的 Markdown 规范文档设计，不容忍多余差分。
- **Milkdown 模式** —— 自由度最高的所见即所得输入（斜杠菜单、格式工具条、LaTeX、Mermaid、图片预览），适合从零起草、随手排版。**代价：保存时会把整篇文档重新序列化，可能改动原有格式**——空白、列表符号 \`-\`/\`*\`、空行、表格对齐等，无法保证零差分。这正是 \`.md\` 默认用保持模式的原因。用右下角的 **保持 / Milkdown** 按钮切换，或命令面板（\`Ctrl+P\` → *切换编辑器模式*）。从 Milkdown 切回保持模式时，若有未保存内容会先提示，因为重排后的文本会被带回。

保持与 Milkdown 是两种**编辑器模式**。**源码视图**（\`Ctrl+/\`）只是当前文档的原始文本视图，不是第三种编辑器模式；打开或关闭源码视图不会改变该标签选择的编辑器。

## 保持模式：编辑功能（重点）

- **编辑表格单元格** —— 单击选中，方向键或 \`Tab\` 移动，\`Enter\` / \`F2\` 编辑（仍支持双击）。多行编辑框中用 \`Ctrl/Cmd+Enter\` 确认、\`Esc\` 取消；\`Alt+↓\` 打开列筛选，\`Shift+F10\` 打开表格操作。
- **内容编辑（改源码）** —— 段落、标题、列表、引用等块，点块右上角的 **内容编辑** 按钮，在文本框里改原文后确认，只替换该块所在的行。
- **任务与内容块结构** —— GFM 任务框可直接点击切换 \`[ ]\` / \`[x]\`。右键非表格内容块可在上方/下方插入、复制或删除；命令面板也提供同样操作。
- **表格行列增删** —— 在单元格上**右键**：上方/下方插入行、删除本行、左侧/右侧插入列、删除本列（最后一列受保护，不能删）。
- **Excel 式列筛选** —— 点表头的 **▼**，勾选取值或搜索，临时隐藏不需要的行。多列之间为 AND；状态栏显示「筛选 X/Y」，点它可一键清除全部筛选（表格右键也能只清除该表）。**仅影响显示，绝不写入文件、不影响保存。**
- **撤销 / 重做已确认的编辑** —— 单元格、任务、内容块、块结构以及表格行列改动都会记录为 Keep 事务。可用 \`Ctrl/Cmd+Z\`、\`Ctrl/Cmd+Shift+Z\`（Windows 也可用 \`Ctrl+Y\`），或点状态栏「已修改」旁的显式按钮。
- **草稿保护** —— 尚未确认的单元格或内容块编辑会跟随所属标签保留；切到别的标签再回来仍可继续。保存、切换编辑器模式或执行 Keep 撤销/重做前，会要求先确认或取消这份草稿。
- **保存前审阅** —— 「查看本次修改」会对比当前内容与上次保存版本，逐项定位源码范围，并可只恢复选中的一项；外部文件冲突也可先进行同样的只读比较。
- **零差分保存** —— 不重排版，不动空白/符号/引用，行尾保留（LF/CRLF 混排原样保留）。\`git diff\` 里只出现你真正改动的那几处，别无其他。

保持模式可渲染标题、段落、列表、表格、普通代码块、引用、分隔线、YAML frontmatter、相对路径图片、\`\`\`mermaid 图和块级 \`$$…$$\` 公式；行内支持 **粗体**、*斜体*、~~删除线~~、\`代码\`、链接、自动链接、==高亮== 和 \`<br>\`。GFM 任务框可直接点击切换。Mermaid、公式和图片预览均可放大。斜杠菜单与自由所见即所得编辑仍由 Milkdown 提供。

连续点击状态栏的视图按钮可进入**富文本 + 源码**：在原始 Markdown 旁同步显示保持模式效果，并可交换左右位置、固定预览或启用双向滚动；两栏始终编辑同一份文档。

## 通用功能

- **标签页** —— 文件树单击使用一个可替换的预览标签，双击或开始编辑后转为普通标签。\`Ctrl+Tab\` 显示最近使用的标签，\`Ctrl+Shift+T\` 恢复最近关闭的文件；标签仍可拖拽排序与固定，放不下时才显示前后切换按钮。
- **文件夹工作区** —— 文件树支持方向键、Enter、F2、Delete、Shift+F10 以及剪切粘贴移动。需要查看点文件时可开启「显示隐藏文件」；\`.git\` 与 \`node_modules\` 始终排除。折叠目录可右键刷新。
- **命令面板**（\`Ctrl+P\`）—— 可选择文件、命令、当前/工作区标题、行号或帮助范围；\`>\`、\`@\`、\`#\`、\`:\`、\`?\` 快速前缀继续保留。
- **大纲面板** —— 点标题跳转，随编辑实时更新。
- **查找 / 替换**（\`Ctrl+F\` / \`Ctrl+H\`）—— 文本检索与替换（单个或全部），或点模式按钮切到**按行号定位**，输入行号跳转。
- **工作区全文搜索**（\`Ctrl+Shift+F\`）—— 在打开的文件夹内跨文件搜索，支持区分大小写、全词匹配与正则，点结果直接跳到对应行。
- **跳转历史** —— 大纲、链接、搜索结果、行号、文件和标签跳转统一进入前进/后退历史。用 \`Alt+←\` / \`Alt+→\`（macOS 为 Option）、鼠标侧键或命令面板，可回到刚才的文档位置。
- **设置面板**（\`Ctrl+,\`）—— 集中管理编辑、字体、外观、语言与系统选项。可分别选择英文、中文、日文和代码字体，并开启自动保存、拼写检查、隐藏文件或「持久化本地历史」；历史有容量上限且只留在当前设备。
- **排版与专注** —— 状态栏排版入口集中编辑宽度、字号、缩放、行间距与段落间距。按 \`Ctrl/Cmd+K\` 后再按 \`Z\` 可进入 Zen 专注模式，且不会卸载编辑器。
- **导出与打印** —— 导出 PDF（\`Ctrl+Shift+E\`）、导出 HTML（\`Ctrl+Shift+H\`，单文件自包含、图片一并内嵌）、系统打印（\`Ctrl+Alt+P\`）。
- **多套主题** —— 暖光 / 暖夜，外加四套**莫兰迪**配色（灰绿、豆沙、雾蓝、暮），并支持 Typora 兼容的自定义 \`.css\` 主题。
- **多语言** —— 英文 / 中文 / 日文随时切换（右下角），应用菜单一并跟随。
- **日文排版** —— 含假名的文档自动切换到日文字体，其中的汉字按日文字形显示；导出 PDF / HTML 与打印同样生效。
- **图片** —— 在 Milkdown 模式下粘贴或拖入图片，会自动存进文档旁的 \`assets/\` 并插入相对路径。
- **附件** —— 「添加附件…」会把所选文件复制到已保存文档旁，并插入便于迁移的相对链接。
- **链接** —— 保持模式下普通单击即可打开网页链接或跳到内部文档；Milkdown 下使用 **Ctrl/Cmd 点击**。链接诊断、引用查询与重命名预览可帮助维护工作区内的链接。
- **帮助中心** —— 按 \`F1\` 打开可搜索的中、英、日三语指南，查看快捷键、工作流程和常见问题。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 帮助中心 | \`F1\` |
| 新建文件 | \`Ctrl+N\` |
| 打开文件 / 文件夹 | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| 保存 / 另存为 | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| 关闭标签 | \`Ctrl+W\` |
| 循环标签 | \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` |
| Keep 撤销 / 重做 | \`Ctrl/Cmd+Z\` / \`Ctrl/Cmd+Shift+Z\`（Windows：\`Ctrl+Y\`） |
| 跳转后退 / 前进 | \`Alt+←\` / \`Alt+→\` |
| 命令面板 | \`Ctrl+P\` |
| 文件内查找 / 替换 | \`Ctrl+F\` / \`Ctrl+H\` |
| 工作区全文搜索 | \`Ctrl+Shift+F\` |
| 设置 | \`Ctrl+,\` |
| 导出 PDF / HTML | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| 打印 | \`Ctrl+Alt+P\` |
| 切换侧边栏 / 大纲 | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| 切换源码视图 | \`Ctrl+/\` |
| 恢复最近关闭的标签 | \`Ctrl+Shift+T\` |

> macOS 上多数 \`Ctrl\` 快捷键换成 \`⌘\`；标签循环仍用 \`Ctrl+Tab\`，跳转历史用 \`⌥+←/→\`，「替换」为 \`⌥⌘F\`。

祝写作愉快！✨
`

const JA = `# EasyMarkdown 使い方ガイド 📝

**EasyMarkdown** は温かみのある Typora 風の **Markdown エディタ**です。すべてのファイルを新しいアプリではなく、同じウィンドウの**タブ**として開きます。サイドバーでフォルダ全体を見渡し、タブでファイルを切り替え、\`.md\` を**キープモード**で編集します —— 原文を正本として保持し、保存結果が**差分ゼロ**（実際に変更したバイトだけ）になる方式です。

> このガイドは、プログラムフォルダ内の \`README.md\` としても同梱されます。このタブは編集しても閉じても構いません —— 次回起動時には表示されません。

## 2 つの編集モードとソース表示

\`.md\` / \`.markdown\` / \`.mdx\` は**既定でキープモード**で開きます。\`.txt\` や非常に大きなファイルはプレーンテキストエディタで開きます。

- **キープモード（既定）** —— ファイルの原文が**正本そのもの**です。描画は表示専用で、編集は箇所ごとに行い、保存で残りが再整形されることはありません。Git で管理する Markdown 仕様書のように、余計な差分が許されない用途のために作られています。
- **Milkdown モード** —— 自由度が最も高い WYSIWYG 入力（スラッシュメニュー、書式ツールバー、LaTeX、Mermaid、画像プレビュー）。ゼロから書き起こすのに向きます。**代償：保存時に文書全体を再シリアライズするため、元の書式が変わることがあります**——空白、リスト記号 \`-\`/\`*\`、空行、表の桁揃えなど。差分ゼロは保証されません。これが \`.md\` を既定でキープモードにしている理由です。右下の **キープ / Milkdown** ボタン、またはコマンドパレット（\`Ctrl+P\` → *エディタモードを切り替え*）で切り替えます。キープモードへ戻す際は、再整形後のテキストが引き継がれるため、未保存の変更があると警告します。

キープと Milkdown は 2 つの**エディタモード**です。**ソース表示**（\`Ctrl+/\`）は現在の文書を原文で見るための表示であり、第 3 のエディタモードではありません。開閉してもタブに選択されたエディタは変わりません。

## キープモード：編集機能（重要）

- **表セルの編集** —— クリックで選択し、矢印キーまたは \`Tab\` で移動、\`Enter\` / \`F2\` で編集します（ダブルクリックも利用可）。複数行入力欄では \`Ctrl/Cmd+Enter\` で確定、\`Esc\` で取消。\`Alt+↓\` で列フィルター、\`Shift+F10\` で表操作を開きます。
- **内容を編集（ソース編集）** —— 段落・見出し・リスト・引用などのブロックは、右上の **内容を編集** ボタンから原文を書き換えて確定します。そのブロックの行だけが置換されます。
- **タスクとブロック構造** —— GFM タスクチェックボックスはクリックで \`[ ]\` / \`[x]\` を切り替えられます。表以外のブロックを右クリックすると、上/下への挿入、複製、削除ができ、コマンドパレットからも実行できます。
- **表の行・列の追加／削除** —— セルを**右クリック**：上に/下に行を挿入、行を削除、左に/右に列を挿入、列を削除（最後の 1 列は保護され削除できません）。
- **Excel 風の列フィルタ** —— 列ヘッダの **▼** をクリックし、値のチェックや検索で行を一時的に隠します。複数列は AND。ステータスバーに「絞り込み X/Y」と表示され、クリックすると全フィルタを一括解除できます（表を右クリックすればその表だけ解除）。**表示専用で、ファイルには一切触れず、保存にも影響しません。**
- **確定済み編集の Undo / Redo** —— セル、タスク、内容ブロック、ブロック構造、表の行・列の変更は Keep トランザクションとして記録されます。\`Ctrl/Cmd+Z\`、\`Ctrl/Cmd+Shift+Z\`（Windows は \`Ctrl+Y\` も可）、またはステータスバーの「変更あり」横にあるボタンを使用します。
- **草稿保護** —— 未確定のセル／内容ブロック編集は所属タブに保持され、別タブから戻ると続きから編集できます。保存、エディタモード切替、Keep の Undo/Redo の前には、その草稿を確定または取消するよう案内されます。
- **保存前レビュー** —— 「今回の変更をレビュー」は現在の内容と前回保存版を比較し、各ソース範囲へ移動したり、選択した範囲だけを戻したりできます。外部ファイルとの競合も同じ読み取り専用比較で確認できます。
- **差分ゼロ保存** —— 再整形なし、空白・記号・引用の揺れなし、改行コードも保持（LF/CRLF 混在もそのまま）。\`git diff\` には実際に編集した箇所だけが現れます。

キープモードは見出し・段落・リスト・表・通常のコードブロック・引用・水平線・YAML frontmatter・相対パス画像・\`\`\`mermaid 図・ブロック \`$$…$$\` 数式を描画し、インラインの **太字**・*斜体*・~~取り消し線~~・\`コード\`・リンク・自動リンク・==ハイライト==・\`<br>\` に対応します。GFM タスクチェックボックスは直接切り替えられます。Mermaid、数式、画像のプレビューは拡大できます。スラッシュコマンドと自由な WYSIWYG 編集は Milkdown で利用します。

ステータスバーの表示ボタンを切り替えると**ソース + キープ**を開けます。生の Markdown とキープ描画を同期して並べ、左右の交換、プレビュー固定、双方向スクロールを利用できます。どちらも同じ文書を編集します。

## 共通機能

- **タブ** —— ファイルツリーのシングルクリックは置換可能なプレビュータブを使い、ダブルクリックまたは編集で通常タブになります。\`Ctrl+Tab\` は最近使ったタブを表示し、\`Ctrl+Shift+T\` は閉じたファイルを復元します。ドラッグ並べ替えとピン留めも利用できます。
- **フォルダワークスペース** —— ファイルツリーは矢印、Enter、F2、Delete、Shift+F10、切り取り／貼り付けに対応します。「隠しファイルを表示」でドットファイルを表示できますが、\`.git\` と \`node_modules\` は常に除外されます。
- **コマンドパレット**（\`Ctrl+P\`）—— ファイル、コマンド、現在／ワークスペースの見出し、行番号、ヘルプから検索範囲を選べます。\`>\`、\`@\`、\`#\`、\`:\`、\`?\` の接頭辞も引き続き使えます。
- **アウトラインパネル** —— 見出しをクリックでジャンプ。編集に追従。
- **検索 / 置換**（\`Ctrl+F\` / \`Ctrl+H\`）—— テキストの検索と置換（1 件 / 全件）、またはモードボタンで**行番号ジャンプ**に切り替え。
- **ワークスペース全文検索**（\`Ctrl+Shift+F\`）—— 開いているフォルダ内をファイル横断で検索。大文字小文字の区別・単語単位・正規表現に対応し、結果をクリックすると該当行へ移動します。
- **移動履歴** —— アウトライン、リンク、検索結果、行番号、ファイル、タブの移動を 1 つの戻る／進む履歴に記録します。\`Alt+←\` / \`Alt+→\`（macOS は Option）、マウス側面ボタン、またはコマンドパレットで直前の文書位置へ戻れます。
- **設定パネル**（\`Ctrl+,\`）—— 編集、フォント、外観、言語、システム設定をまとめて管理します。英語・中国語・日本語・コードのフォントを個別に選び、自動保存、スペルチェック、隠しファイル、端末内だけに保持する「永続ローカル履歴」を有効にできます。
- **組版と集中** —— ステータスバーの組版から編集幅、文字サイズ、ズーム、行間、段落間隔を調整できます。\`Ctrl/Cmd+K\` に続けて \`Z\` を押すと、エディタを再読み込みせず集中モードへ入ります。
- **書き出しと印刷** —— PDF（\`Ctrl+Shift+E\`）、HTML（\`Ctrl+Shift+H\`、画像を埋め込んだ自己完結の単一ファイル）、システム印刷（\`Ctrl+Alt+P\`）。
- **テーマ** —— 暖かいライト / ダークに加え 4 種の **モランディ** パレット（セージ・ローズ・ミスト・ダスク）、Typora 互換のカスタム \`.css\` テーマにも対応。
- **多言語** —— 英語 / 中文 / 日本語をいつでも切り替え（右下）。アプリのメニューも追従します。
- **日本語組版** —— 仮名を含む文書は自動的に日本語フォントへ切り替わり、漢字が日本語の字形で表示されます。PDF / HTML の書き出しと印刷にも同様に適用されます。
- **画像** —— Milkdown モードで画像を貼り付け／ドロップすると、文書の隣の \`assets/\` に保存され、相対パスとして挿入されます。
- **添付ファイル** —— 「添付ファイルを追加…」は選択したファイルを保存済み文書の近くへコピーし、移動しやすい相対リンクを挿入します。
- **リンク** —— キープでは通常クリックで Web リンクを開き、内部文書へ移動します。Milkdown では **Ctrl/Cmd + クリック**を使用します。リンク診断、参照検索、名前変更プレビューでワークスペースのリンクを保てます。
- **ヘルプセンター** —— \`F1\` で検索可能な英語・中国語・日本語ガイドを開き、ショートカット、ワークフロー、トラブル対処を確認できます。

## キーボードショートカット

| 操作 | ショートカット |
| --- | --- |
| ヘルプセンター | \`F1\` |
| 新規ファイル | \`Ctrl+N\` |
| ファイル / フォルダを開く | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| タブを閉じる | \`Ctrl+W\` |
| 保存 / 名前を付けて保存 | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| コマンドパレット | \`Ctrl+P\` |
| タブを順に切り替え | \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` |
| Keep Undo / Redo | \`Ctrl/Cmd+Z\` / \`Ctrl/Cmd+Shift+Z\`（Windows：\`Ctrl+Y\`） |
| 移動履歴の戻る / 進む | \`Alt+←\` / \`Alt+→\` |
| ファイル内検索 / 置換 | \`Ctrl+F\` / \`Ctrl+H\` |
| ワークスペース全文検索 | \`Ctrl+Shift+F\` |
| 設定 | \`Ctrl+,\` |
| PDF / HTML 書き出し | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| 印刷 | \`Ctrl+Alt+P\` |
| サイドバー / アウトライン切り替え | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| ソース表示切り替え | \`Ctrl+/\` |
| 閉じたタブを復元 | \`Ctrl+Shift+T\` |

> macOS では多くの \`Ctrl\` ショートカットを \`⌘\` に読み替えます。タブ切替は \`Ctrl+Tab\` のまま、移動履歴は \`⌥+←/→\`、置換は \`⌥⌘F\` です。

楽しく執筆を！✨
`

export function welcomeDoc(lang) {
  const title =
    lang === 'zh'
      ? 'EasyMarkdown 使用说明.md'
      : lang === 'ja'
        ? 'EasyMarkdown 使い方ガイド.md'
        : 'EasyMarkdown User Guide.md'
  const content = lang === 'zh' ? ZH : lang === 'ja' ? JA : EN
  return { title, content }
}

// All three languages (中文 → 日本語 → English), for the README.md shipped in
// the program directory.
export function readmeDoc() {
  const nav = '> 中文 · 日本語 · English\n'
  return [nav, welcomeDoc('zh').content, welcomeDoc('ja').content, welcomeDoc('en').content].join(
    '\n\n---\n\n'
  )
}
