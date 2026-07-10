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

## Two editing modes

\`.md\` / \`.markdown\` / \`.mdx\` open in **keep mode by default**. \`.txt\` and very large files open in a plain-text editor.

- **Keep mode (default)** — the original file text *is* the source of truth. Rendering is read-only; you edit in place, one spot at a time, and saving never re-formats the rest. Built for Markdown specs tracked in Git, where stray diffs are not acceptable.
- **Milkdown mode** — the most free-form WYSIWYG typing (slash menu, formatting toolbar, LaTeX, Mermaid, image preview), great for drafting from scratch. **Trade-off: on save it re-serializes the whole document, so it may change the original formatting** — whitespace, list markers \`-\`/\`*\`, blank lines, table alignment — and cannot guarantee a zero diff. That is exactly why \`.md\` defaults to keep mode. Switch with the **Keep / Milkdown** button at the bottom-right, or the command palette (\`Ctrl+P\` → *Toggle Editor Mode*). Switching back to keep mode warns you about unsaved changes, since the re-flowed text would be carried over.

## Keep mode: editing (the important part)

- **Edit a table cell** — *double-click* it, type, \`Enter\` to confirm / \`Esc\` to cancel. Only that one cell on that one line is rewritten; everything else stays byte-for-byte. Cells containing \`<br>\` open in a multi-line box.
- **Edit content (block source)** — for a paragraph, heading, list or quote, click the **Edit content** button at the block's top-right, change the raw text in the box, and confirm. Only that block's lines are replaced.
- **Add / remove table rows & columns** — *right-click* a cell: insert row above / below, delete row, insert column left / right, delete column (the last column is protected).
- **Excel-style column filter** — click the **▼** on a column header, then check values or search to temporarily hide rows. Multiple columns combine with AND; the status bar shows \`Filtered X/Y\` — click it to clear every filter at once (right-click a table to clear just that one). **Display only — it never touches the file or affects saving.**
- **Zero-diff save** — no re-formatting, no whitespace/bullet/quote churn, line endings preserved (mixed LF/CRLF kept as-is). \`git diff\` shows exactly the edits you made and nothing else.

Keep mode renders headings, paragraphs, lists, tables, code blocks, quotes, horizontal rules, GFM task lists (tick them directly) and YAML frontmatter (shown as an info card), with inline **bold**, *italic*, ~~strikethrough~~, \`code\`, links, autolinks, ==highlights== and \`<br>\`. A list separated by blank lines is shown as a loose list. A code block — including a \`\`\`mermaid one — stays shown as its source text in keep mode; that's expected, not a failure. For slash commands, LaTeX math, rendered Mermaid diagrams and inline image preview, switch to Milkdown mode.

## General features

- **Tabs** — many files in one window (\`Ctrl+Tab\` to cycle), reorderable by drag, and pinnable (pinned tabs sit on the left and survive "Close others"). Right-click a tab to close others / to the left / to the right, or to open it in a split pane on the right.
- **Folder workspace** — a file tree on the left; create, rename, delete in place. If a collapsed folder changed on disk, right-click it and choose **Refresh** to rescan.
- **Command palette** (\`Ctrl+P\`) — fuzzy-jump to any file or command.
- **Outline panel** — click a heading to jump; follows your edits live.
- **Find / Replace** (\`Ctrl+F\` / \`Ctrl+H\`) — search and replace (one or all), or click the mode button to switch to **Go to line** and jump by line number.
- **Workspace search** (\`Ctrl+Shift+F\`) — search across every file in the open folder, with case-sensitive, whole-word and regex options; click a hit to jump straight to that line.
- **Settings panel** (\`Ctrl+,\`) — editing, layout, appearance and language in one place. Turn on autosave, spellcheck, or **Honor blank lines** for keep mode (all off by default), or make EasyMarkdown the default app for \`.md\` files.
- **Export & print** — PDF (\`Ctrl+Shift+E\`), HTML (\`Ctrl+Shift+H\`, a self-contained single file with images embedded), and system print (\`Ctrl+Alt+P\`).
- **Themes** — Warm Light / Dark plus four **Morandi** palettes (Sage, Rose, Mist, Dusk), and Typora-compatible custom \`.css\` themes.
- **Languages** — English / 中文 / 日本語, switchable anytime (bottom-right); the app menu follows along.
- **Japanese typography** — a document containing kana switches to a Japanese font stack, so its kanji render with Japanese glyph forms; PDF/HTML export and printing do the same.
- **Images** — paste or drop an image in Milkdown mode and it is saved into an \`assets/\` folder next to the document, inserted as a relative path.
- **Ctrl/Cmd + Click** a link to open it in your browser; relative-path images just work; external edits to an open file reload automatically.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New file | \`Ctrl+N\` |
| Open file / folder | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| Save / Save As | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| Close tab | \`Ctrl+W\` |
| Command palette | \`Ctrl+P\` |
| Find / Replace in file | \`Ctrl+F\` / \`Ctrl+H\` |
| Search the workspace | \`Ctrl+Shift+F\` |
| Settings | \`Ctrl+,\` |
| Export PDF / HTML | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| Print | \`Ctrl+Alt+P\` |
| Toggle sidebar / outline | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| Toggle source mode | \`Ctrl+/\` |
| Cycle theme | \`Ctrl+Shift+T\` |

> On macOS swap \`Ctrl\` for \`⌘\`. Replace is the one exception — it is \`⌥⌘F\`.

Happy writing! ✨
`

const ZH = `# EasyMarkdown 使用说明 📝

**EasyMarkdown** 是一款温暖的 Typora 风 **Markdown 编辑器**。每个文件都在同一个窗口里作为**标签页**打开，而不是新开一个程序。在侧边栏浏览整个文件夹，用标签页切换文件，并以**保持模式**编辑 \`.md\` —— 一种以原文为正本的编辑方式，保存结果**零差分**（只改你真正动过的字节）。

> 这份说明也会随安装包放到程序目录下的 \`README.md\`。你可以编辑本页或直接关掉它 —— 下次启动不会再出现。

## 两种编辑模式

\`.md\` / \`.markdown\` / \`.mdx\` **默认用保持模式**打开；\`.txt\` 和超大文件用纯文本编辑器打开。

- **保持模式（默认）** —— 文件原文**就是正本**。渲染只用于显示，编辑是逐处进行的，保存绝不会重排其余内容。专为用 Git 管理的 Markdown 规范文档设计，不容忍多余差分。
- **Milkdown 模式** —— 自由度最高的所见即所得输入（斜杠菜单、格式工具条、LaTeX、Mermaid、图片预览），适合从零起草、随手排版。**代价：保存时会把整篇文档重新序列化，可能改动原有格式**——空白、列表符号 \`-\`/\`*\`、空行、表格对齐等，无法保证零差分。这正是 \`.md\` 默认用保持模式的原因。用右下角的 **保持 / Milkdown** 按钮切换，或命令面板（\`Ctrl+P\` → *切换编辑器模式*）。从 Milkdown 切回保持模式时，若有未保存内容会先提示，因为重排后的文本会被带回。

## 保持模式：编辑功能（重点）

- **编辑表格单元格** —— **双击**单元格输入，\`Enter\` 确认 / \`Esc\` 取消。只改这一格、这一行，其余字节原样不动。含 \`<br>\` 的单元格会用多行文本框编辑。
- **内容编辑（改源码）** —— 段落、标题、列表、引用等块，点块右上角的 **内容编辑** 按钮，在文本框里改原文后确认，只替换该块所在的行。
- **表格行列增删** —— 在单元格上**右键**：上方/下方插入行、删除本行、左侧/右侧插入列、删除本列（最后一列受保护，不能删）。
- **Excel 式列筛选** —— 点表头的 **▼**，勾选取值或搜索，临时隐藏不需要的行。多列之间为 AND；状态栏显示「筛选 X/Y」，点它可一键清除全部筛选（表格右键也能只清除该表）。**仅影响显示，绝不写入文件、不影响保存。**
- **零差分保存** —— 不重排版，不动空白/符号/引用，行尾保留（LF/CRLF 混排原样保留）。\`git diff\` 里只出现你真正改动的那几处，别无其他。

保持模式可渲染标题、段落、列表、表格、代码块、引用、分隔线、GFM 任务列表（可直接勾选）和 YAML frontmatter（显示为信息卡片），以及行内 **粗体**、*斜体*、~~删除线~~、\`代码\`、链接、自动链接、==高亮== 和 \`<br>\`。被空行隔开的列表会按宽松列表显示。代码块——包括 \`\`\`mermaid 块——在保持模式下保持源码原样显示，这是正常的，不是渲染失败。需要斜杠菜单、LaTeX 公式、渲染后的 Mermaid 图、行内图片预览时，切到 Milkdown 模式。

## 通用功能

- **标签页** —— 一个窗口开多个文件（\`Ctrl+Tab\` 循环），可拖拽排序，也可固定（固定的标签靠左，不会被「关闭其他标签」误关）。标签右键可关闭其他/左侧/右侧，或在右侧分屏中打开。
- **文件夹工作区** —— 左侧文件树，可原地新建 / 重命名 / 删除。折叠着的文件夹如有外部改动，右键「刷新」即可重新扫描。
- **命令面板**（\`Ctrl+P\`）—— 模糊跳转到任意文件或命令。
- **大纲面板** —— 点标题跳转，随编辑实时更新。
- **查找 / 替换**（\`Ctrl+F\` / \`Ctrl+H\`）—— 文本检索与替换（单个或全部），或点模式按钮切到**按行号定位**，输入行号跳转。
- **工作区全文搜索**（\`Ctrl+Shift+F\`）—— 在打开的文件夹内跨文件搜索，支持区分大小写、全词匹配与正则，点结果直接跳到对应行。
- **设置面板**（\`Ctrl+,\`）—— 编辑、排版、外观、语言集中一处。可开启自动保存、拼写检查与保持模式的「保留连续空行」（默认均关闭），也能把 EasyMarkdown 设为 \`.md\` 的默认打开程序。
- **导出与打印** —— 导出 PDF（\`Ctrl+Shift+E\`）、导出 HTML（\`Ctrl+Shift+H\`，单文件自包含、图片一并内嵌）、系统打印（\`Ctrl+Alt+P\`）。
- **多套主题** —— 暖光 / 暖夜，外加四套**莫兰迪**配色（灰绿、豆沙、雾蓝、暮），并支持 Typora 兼容的自定义 \`.css\` 主题。
- **多语言** —— 英文 / 中文 / 日文随时切换（右下角），应用菜单一并跟随。
- **日文排版** —— 含假名的文档自动切换到日文字体，其中的汉字按日文字形显示；导出 PDF / HTML 与打印同样生效。
- **图片** —— 在 Milkdown 模式下粘贴或拖入图片，会自动存进文档旁的 \`assets/\` 并插入相对路径。
- 按 **Ctrl/Cmd 点击**链接用浏览器打开；相对路径图片开箱即用；外部修改正在打开的文件会自动刷新。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 新建文件 | \`Ctrl+N\` |
| 打开文件 / 文件夹 | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| 保存 / 另存为 | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| 关闭标签 | \`Ctrl+W\` |
| 命令面板 | \`Ctrl+P\` |
| 文件内查找 / 替换 | \`Ctrl+F\` / \`Ctrl+H\` |
| 工作区全文搜索 | \`Ctrl+Shift+F\` |
| 设置 | \`Ctrl+,\` |
| 导出 PDF / HTML | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| 打印 | \`Ctrl+Alt+P\` |
| 切换侧边栏 / 大纲 | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| 切换源码模式 | \`Ctrl+/\` |
| 切换主题 | \`Ctrl+Shift+T\` |

> macOS 上把 \`Ctrl\` 换成 \`⌘\` 即可；只有「替换」是例外，为 \`⌥⌘F\`。

祝写作愉快！✨
`

const JA = `# EasyMarkdown 使い方ガイド 📝

**EasyMarkdown** は温かみのある Typora 風の **Markdown エディタ**です。すべてのファイルを新しいアプリではなく、同じウィンドウの**タブ**として開きます。サイドバーでフォルダ全体を見渡し、タブでファイルを切り替え、\`.md\` を**キープモード**で編集します —— 原文を正本として保持し、保存結果が**差分ゼロ**（実際に変更したバイトだけ）になる方式です。

> このガイドは、プログラムフォルダ内の \`README.md\` としても同梱されます。このタブは編集しても閉じても構いません —— 次回起動時には表示されません。

## 2 つの編集モード

\`.md\` / \`.markdown\` / \`.mdx\` は**既定でキープモード**で開きます。\`.txt\` や非常に大きなファイルはプレーンテキストエディタで開きます。

- **キープモード（既定）** —— ファイルの原文が**正本そのもの**です。描画は表示専用で、編集は箇所ごとに行い、保存で残りが再整形されることはありません。Git で管理する Markdown 仕様書のように、余計な差分が許されない用途のために作られています。
- **Milkdown モード** —— 自由度が最も高い WYSIWYG 入力（スラッシュメニュー、書式ツールバー、LaTeX、Mermaid、画像プレビュー）。ゼロから書き起こすのに向きます。**代償：保存時に文書全体を再シリアライズするため、元の書式が変わることがあります**——空白、リスト記号 \`-\`/\`*\`、空行、表の桁揃えなど。差分ゼロは保証されません。これが \`.md\` を既定でキープモードにしている理由です。右下の **キープ / Milkdown** ボタン、またはコマンドパレット（\`Ctrl+P\` → *エディタモードを切り替え*）で切り替えます。キープモードへ戻す際は、再整形後のテキストが引き継がれるため、未保存の変更があると警告します。

## キープモード：編集機能（重要）

- **表セルの編集** —— セルを**ダブルクリック**して入力、\`Enter\` で確定 / \`Esc\` で取消。そのセル・その行だけが書き換わり、他はバイト単位でそのままです。\`<br>\` を含むセルは複数行の入力欄で編集します。
- **内容を編集（ソース編集）** —— 段落・見出し・リスト・引用などのブロックは、右上の **内容を編集** ボタンから原文を書き換えて確定します。そのブロックの行だけが置換されます。
- **表の行・列の追加／削除** —— セルを**右クリック**：上に/下に行を挿入、行を削除、左に/右に列を挿入、列を削除（最後の 1 列は保護され削除できません）。
- **Excel 風の列フィルタ** —— 列ヘッダの **▼** をクリックし、値のチェックや検索で行を一時的に隠します。複数列は AND。ステータスバーに「絞り込み X/Y」と表示され、クリックすると全フィルタを一括解除できます（表を右クリックすればその表だけ解除）。**表示専用で、ファイルには一切触れず、保存にも影響しません。**
- **差分ゼロ保存** —— 再整形なし、空白・記号・引用の揺れなし、改行コードも保持（LF/CRLF 混在もそのまま）。\`git diff\` には実際に編集した箇所だけが現れます。

キープモードは見出し・段落・リスト・表・コードブロック・引用・水平線に加え、GFM タスクリスト（そのままチェック可能）と YAML frontmatter（情報カードとして表示）を描画し、インラインの **太字**・*斜体*・~~取り消し線~~・\`コード\`・リンク・自動リンク・==ハイライト==・\`<br>\` に対応します。空行で区切られたリストはゆったりしたリストとして表示されます。コードブロック（\`\`\`mermaid を含む）はキープモードではソースのまま表示されます。これは正常で、描画失敗ではありません。スラッシュコマンド、LaTeX 数式、描画された Mermaid 図、インライン画像プレビューが必要な場合は Milkdown モードに切り替えてください。

## 共通機能

- **タブ** —— 1 つのウィンドウで複数ファイル（\`Ctrl+Tab\` で切替）。ドラッグで並べ替えでき、ピン留めも可能（ピン留めしたタブは左に寄り、「他のタブを閉じる」でも閉じません）。タブ右クリックで他を閉じる/左側を閉じる/右側を閉じる、または右側の分割ビューで開く。
- **フォルダワークスペース** —— 左のファイルツリーで作成・名前変更・削除をその場で。折りたたみ中のフォルダが外部で変更された場合は、右クリックの「更新」で再スキャンできます。
- **コマンドパレット**（\`Ctrl+P\`）—— 任意のファイルやコマンドへあいまい検索でジャンプ。
- **アウトラインパネル** —— 見出しをクリックでジャンプ。編集に追従。
- **検索 / 置換**（\`Ctrl+F\` / \`Ctrl+H\`）—— テキストの検索と置換（1 件 / 全件）、またはモードボタンで**行番号ジャンプ**に切り替え。
- **ワークスペース全文検索**（\`Ctrl+Shift+F\`）—— 開いているフォルダ内をファイル横断で検索。大文字小文字の区別・単語単位・正規表現に対応し、結果をクリックすると該当行へ移動します。
- **設定パネル**（\`Ctrl+,\`）—— 編集・レイアウト・外観・言語を 1 か所に集約。自動保存、スペルチェック、キープモードの「連続する空行を活かす」（いずれも既定オフ）を有効化でき、\`.md\` の既定アプリを EasyMarkdown に設定することもできます。
- **書き出しと印刷** —— PDF（\`Ctrl+Shift+E\`）、HTML（\`Ctrl+Shift+H\`、画像を埋め込んだ自己完結の単一ファイル）、システム印刷（\`Ctrl+Alt+P\`）。
- **テーマ** —— 暖かいライト / ダークに加え 4 種の **モランディ** パレット（セージ・ローズ・ミスト・ダスク）、Typora 互換のカスタム \`.css\` テーマにも対応。
- **多言語** —— 英語 / 中文 / 日本語をいつでも切り替え（右下）。アプリのメニューも追従します。
- **日本語組版** —— 仮名を含む文書は自動的に日本語フォントへ切り替わり、漢字が日本語の字形で表示されます。PDF / HTML の書き出しと印刷にも同様に適用されます。
- **画像** —— Milkdown モードで画像を貼り付け／ドロップすると、文書の隣の \`assets/\` に保存され、相対パスとして挿入されます。
- リンクは **Ctrl/Cmd + クリック** でブラウザで開く。相対パス画像もそのまま動作。開いているファイルが外部で編集されると自動的に再読み込み。

## キーボードショートカット

| 操作 | ショートカット |
| --- | --- |
| 新規ファイル | \`Ctrl+N\` |
| ファイル / フォルダを開く | \`Ctrl+O\` / \`Ctrl+Shift+O\` |
| タブを閉じる | \`Ctrl+W\` |
| 保存 / 名前を付けて保存 | \`Ctrl+S\` / \`Ctrl+Shift+S\` |
| コマンドパレット | \`Ctrl+P\` |
| ファイル内検索 / 置換 | \`Ctrl+F\` / \`Ctrl+H\` |
| ワークスペース全文検索 | \`Ctrl+Shift+F\` |
| 設定 | \`Ctrl+,\` |
| PDF / HTML 書き出し | \`Ctrl+Shift+E\` / \`Ctrl+Shift+H\` |
| 印刷 | \`Ctrl+Alt+P\` |
| サイドバー / アウトライン切り替え | \`Ctrl+B\` / \`Ctrl+Shift+L\` |
| ソースモード切り替え | \`Ctrl+/\` |
| テーマ切り替え | \`Ctrl+Shift+T\` |

> macOS では \`Ctrl\` を \`⌘\` に読み替えてください。置換だけは例外で \`⌥⌘F\` です。

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
