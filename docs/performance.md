# 性能优化：内存与渲染卡顿的根因、已做改动与待办方向

这份文档记录针对"内存占用偏高"和"功能变多后某些场景卡顿"两类反馈做的性能排查、已落地的改动，以及还没做的方向（留作后续按需推进）。排查方式以阅读代码 + 构建产物分析为主；运行时数值需在本地打包版上实测（见 [development.md](./development.md)）。

> 约定：本文不写"省了多少 MB / 多少 ms"这类没有实测的估算。已落地项给出**确定的构建数据**或**改动本身的复杂度变化**；方向项只说根因和手段。

---

## 一、内存

用户反馈两点：**刚启动就偏高**、**开很多 tab 后增长**。

### 1.1 根因：Crepe 富编辑器在启动时被全量加载

`App.jsx` 原本**静态 import** `Editor.jsx`，而 `Editor.jsx` 引入了整个 Milkdown Crepe + ProseMirror + KaTeX 栈。于是这套重代码被打进入口 chunk，**启动即加载**——哪怕 `.md` 默认走的是轻量的源码编辑器 `KeepEditor`（纯 DOM、无 ProseMirror），用户可能整场会话都没开过所见即所得。

构建产物佐证：入口 chunk 原本 **3.6 MB**。

**改动**（[App.jsx](../src/renderer/src/App.jsx) 顶部 + `<Editor>` 渲染处）：

```js
const Editor = lazy(() => import('./components/Editor.jsx'))
// …渲染处用 <Suspense fallback={null}> 包裹 <Editor>
```

**效果**：入口 chunk **3.6 MB → 482 KB**；Crepe/ProseMirror/KaTeX（约 3.1 MB JS + 独立 CSS）拆到按需加载的 `Editor-*.js`，**只在 tab 切到 Milkdown WYSIWYG 时才加载**。一旦本次会话打开过一次，`React.lazy` 会缓存该模块，后续实例即时挂载。

> 结论：用户主力路径（KeepEditor）启动时根本不加载这 3.1 MB，直接缓解"刚启动就偏高"；多开 `.md` 也不再触发 Crepe 加载，"开很多 tab"的内存增长在默认路径上同样被缓解。

### 1.2 根因：Mermaid 渲染缓存无上限

`editor-mermaid.js` 的 `cache` 按 `theme::code` 缓存 SVG、跨编辑器实例共享、**无淘汰**。长会话里编辑很多不同图表（每次按键都产生新 key）会让缓存无界增长。

**改动**（[editor-mermaid.js](../src/renderer/src/components/editor-mermaid.js)）：加 `CACHE_MAX = 120` 的 LRU——`cacheGet` 命中后重新插入标记最近使用，`cacheSet` 超限淘汰最旧。`statusFor` 是非变更性 peek，保持 `cache.get` 不动 LRU 顺序。

### 1.3 待办：非活跃 Crepe 实例的 LRU 卸载

`mountedIds`（[App.jsx](../src/renderer/src/App.jsx)）的设计是 keep-mounted：tab 一旦激活即常驻、只隐藏，直到关闭。配合 1.1 的懒加载，默认路径已不重；但如果实测发现"开很多 Milkdown tab"仍偏高，可给常驻实例加 LRU 上限（保留最近 N 个，超出卸载、再激活时按现有懒挂载机制重建）。**风险较高**（涉及编辑器重建、滚动/光标状态、split 双挂载），应在本地实测确认 Crepe 实例确实是大头后再做。

---

## 二、渲染 / 卡顿

担心点：功能堆多后，某些场景"打字 / 搜索 / 大工程"会卡。排查后纠正了两个被夸大的判断：

- **KeepEditor 不是每键 O(N)**：它主体是只读渲染，编辑走"单元格 / 块源码弹窗"，全量重建 `rerender()`（[KeepEditor.jsx](../src/renderer/src/components/KeepEditor.jsx)）只在**编辑提交时**触发，频率低。大文档时这次重建仍偏重（含一个按块 `querySelector` 的循环），但不是连续打字的开销。
- **真正的"每键开销"在 textarea / 源码模式那条路**：`updateContent → setTabs → 整个 App 重渲染`，而外壳组件没 memo。

### 已做（A + B 批：渲染 / 卡顿，低风险快速项）

| 项 | 文件 | 根因 | 改动 |
| --- | --- | --- | --- |
| **B1 Find 去抖** | [App.jsx](../src/renderer/src/App.jsx) `runFindDebounced` / find 输入 onChange | 边打边高亮每键遍历整个编辑器 DOM，无去抖 | 新增 160ms 去抖；空查询即时清除；Enter / 上一处 / 下一处仍即时；`closeFind` 清挂起定时器 |
| **B2 命令面板去抖** | [CommandPalette.jsx](../src/renderer/src/components/CommandPalette.jsx) | 大工程每键对全部文件打分 / 排序 | 输入框仍绑 `query`（即时），打分改吃 `useDeferredValue(query)` |
| **A2 大纲去抖** | [Outline.jsx](../src/renderer/src/components/Outline.jsx) | 每次输入 `parseHeadings` 重扫全文 | 改吃 `useDeferredValue(content)`，低优先级跟进、不阻塞输入 |
| **A1 Sidebar memo** | [Sidebar.jsx](../src/renderer/src/components/Sidebar.jsx) + [App.jsx](../src/renderer/src/App.jsx) | App 每键重渲染、文件树跟着 diff | `React.memo(Sidebar)`；补稳内联的 `onOpenFile`（`onSidebarOpenFile`）；`openTabPathsRaw` 按"路径列表 join"做 key，使打字时（内容变、路径不变）props 引用稳定 → 整棵文件树不再重渲染 |

> A1 的关键是"让传给 memo 组件的 props 在内容编辑时保持引用稳定"——Sidebar 的 6 个 handler 本就 `useCallback`，只差内联的 `onOpenFile` 和每键重建的 `openTabPathsRaw`。Tabs / StatusBar 天然吃 `tabs` / `activeTab`，对打字场景 memo 无益且要包十几个 handler，故未纳入本批。

### 已做（D + C 批：主进程，低风险快速项）

| 项 | 文件 | 根因 | 改动 |
| --- | --- | --- | --- |
| **D1 保存阻塞** | [main/index.js](../src/main/index.js) `image:inlineForSave` | 保存含图片的文档时用同步 `realpathSync`（1 次 + 每个 `file://` 链接 1 次）阻塞主进程 | 两处改 `await fs.realpath`，并移除不再用到的 `realpathSync` 导入 |
| **C2 watch 去抖调长** | [main/index.js](../src/main/index.js) `watch:start` 的 `ping` | watch 去抖仅 120ms，批量文件变动（git 切分支、批量写）连发多次 `watch:changed` → Sidebar 反复全量重读已展开目录 + 闪烁 | 去抖 120ms → 500ms，一次操作的事件塌缩成一次刷新 |

> 收益点：D1 让"保存含粘贴 / 本地图片的文档"不再有瞬时卡顿（慢盘 / 网络盘 / 图多时最明显）；C2 让 git 切分支 / 批量改文件时文件树不再反复刷新闪烁。

### 已做（E 批：保持模式打开 / 编辑卡顿，本次重点）

用户反馈：**刚启动操作卡（光标移到某区 1~2 秒才高亮）**、**侧边栏切大 markdown 卡一下**、以及最致命的——**在大表格文档里双击进编辑、原样取消也卡 2~3 秒编辑栏才消失**。复测样本是一份 ~2600 行、约 924KB、几乎整篇是单张大表格的 DTO 设计书。

根因不在"功能多"，而在 [KeepEditor.jsx](../src/renderer/src/components/KeepEditor.jsx) 的**更新模型**：`rerender()` 是唯一更新路径，且**全文重建**（`renderDoc` 重新 parse + 拼超大 HTML 串 → `host.innerHTML` 同步构建上万节点 → 整篇布局测量 → embeds），而**任何编辑交互**（单元格提交、筛选确认、连"无改动取消"）都调它。大表格上一次全文重建就是数秒同步卡顿；高亮是纯 CSS `:hover`（[app.css](../src/renderer/src/styles/app.css) `.km-block:hover`），延迟说明主线程被这些同步活占满。

| 项 | 文件 | 根因 | 改动 |
| --- | --- | --- | --- |
| **E1 局部更新：单元格** | [KeepEditor.jsx](../src/renderer/src/components/KeepEditor.jsx) `commitCellPop` | 改一个单元格也全文重建 | 单元格编辑只改一行一列、不移动任何行/块索引 → 直接重绘那一个 `<td>/<th>`（表头保留筛选 ▼，只改 `.km-th-content`），并同步该行 `viewLines`。不再 `rerender()` |
| **E2 局部更新：筛选** | `openFilterPop` 的确认 | 筛选只切行可见性，却全文重建 | 改为 `applyFilter(ti)` + `reportFilter()` + 手动同步 ▼ 的 `active` 类。完全不动 rawLines / DOM 结构 |
| **E3 局部恢复：取消编辑** | `closeBlockEdit(commit)` | 无改动取消也全文重建（块的 innerHTML 被换成了 textarea，所以要重建） | 抽出 `renderBlockInner`（[keep-parser.js](../src/renderer/src/keep-parser.js)）单块渲染；干净取消时只重建**那一个块**的 DOM。提交仍走全量（行数可能变、索引会移） |
| **E4 重活推到首帧后** | `rerender` 拆 `paint` / `finishRenderRange` | 布局测量 + embeds 与 innerHTML 挤在一帧同步跑 | 先 `innerHTML` 出文字（可见可滚），下一帧 `requestAnimationFrame` 再做布局测量 / 筛选 / embeds。主线程及时让位给输入与 `:hover`。**E8 后按 chunk 粒度执行** |
| **E5 布局测量省一半** | `applyMultilineFlagsRange` | 每个非表格块各跑一次 `getComputedStyle().fontSize` | 字号全篇一致 → 只在 `host` 上读一次基准字号；保留"先读后写"两段式批处理 |
| **E6 embeds 懒渲染** | mermaid / KaTeX | mount 时把全篇图表 / 公式一次性渲染 | 改 `IntersectionObserver`（root=滚动容器，`rootMargin:400px`），只渲染进入视口附近的；缓存命中的图直接画、不等滚动。导出 `getDocHTML` 先从 mermaid 缓存回填，避免"没滚到的图导不出" |
| **E7 加载提示（已被 E8 取代）** | ~~`rerender` + `.km-loading` / `.km-spinner`~~ | 超大文档 innerHTML 同步构建那一下无反馈 | 旧方案：行数 > 1200 时先画"加载中…"占位再阻塞构建。**E8 改为分块流式后不再需要占位**（首块即时出），此路径已移除；`.km-loading` CSS / `keep.loading` 文案保留未用 |
| **E8 分块渐进渲染（首屏关键）** | [KeepEditor.jsx](../src/renderer/src/components/KeepEditor.jsx) `rerender` / `flushRemaining` + [keep-parser.js](../src/renderer/src/keep-parser.js) `renderBlockRange` | 整篇一次性 `host.innerHTML` 同步构建上万节点，主线程一卡到底（占位只是转圈，没让构建变增量） | 全文 `parseDoc` 仍同步（便宜，大纲/编辑索引要完整块表），但 DOM 按**块**分批：首块（`CHUNK_BLOCKS`=150）同步出、可立即滚动预览，其余用 `requestIdleCallback` 逐批 `insertAdjacentHTML` 追加，每批跑各自的 `finishRenderRange`。大纲跳转 / find / 导出会先 `ensureRendered()`（`flushRemaining`）同步补齐未画的块；切走 tab 隐藏期间流入的块在回到视图时由 `remeasureRef` 补测 `km-multiline` |

> 取舍：E1/E2/E3 把高频编辑交互从"全文 O(整篇)"降到"O(改动局部)"，是这份 DTO 文档卡顿的直接解药（双击取消不再重建 2600 行表格）。E4~E6 针对"打开/切换"那一下的体感与反馈。**E8 把首屏 DOM 构建从"一次性卡完"改成"首块即时 + 其余空闲流式"**，是大文档（多块）打开体感的关键改善。**残留**：单张超大表格是**一个块**，块粒度分块无法切分它——首屏构建一张 2600 行表的同步成本仍在；彻底解决需表格行级虚拟化（见待办，回归面大，暂不做）。

### 已做（F 批：Markdown 链接诊断与批量更新）

- 不在启动时构建全工作区索引。只有用户打开链接问题面板、查找引用或执行重命名 / 移动时，主进程才按需扫描 Markdown 文件，避免把功能成本加入冷启动。
- 扫描设有硬上限：最大深度 12、最多 5000 个 Markdown 文件、单文件最多 1 MB；每处理 25 个文件主动让出事件循环，避免大工作区扫描长时间占满主进程。
- 引用更新基于源码中的精确目标范围，只替换标题文本或链接目标，不经过 AST 全文序列化，因此能保持原有空白、换行符和非相关格式。
- [test/markdown-links-performance.test.js](../test/markdown-links-performance.test.js) 用 601 个文件、约 7800 条链接的合成工作区守卫引用查询与移动计划，总耗时上限为 2 秒；当前本机运行约 90 ms。

### 待办（结构性 / 中等投入，按需再做）

- **保持模式结构性编辑仍全量重建**：插入/删除行列、块源码"提交"会改行数 → 仍走全文 `rerender()`。大表格上仍会卡一下（含 E7 的加载提示）。可按"受影响表格局部重建"进一步优化，但要正确处理行/列索引迁移与筛选状态，复杂度中等。
- **大表格虚拟化**：~2600 行表格首屏 `innerHTML` 构建上万节点是首屏卡顿的最后大头。虚拟化（只渲染视口行）能根治，但与单元格编辑、筛选、整表复制、列筛选弹窗强耦合，回归面大，建议最后做或不做。

- **D2 文件扫描缓存**：命令面板（[App.jsx](../src/renderer/src/App.jsx) `relistFiles`）首次开 + 每次根变化 / watch 刷新都全量重扫所有根；`listFilesFlat`（[main/index.js](../src/main/index.js)）深度优先串行。大工程慢。可：①靠 C2 的长去抖减少重扫次数（已顺带）；②目录读取改有并发上限的并行；③主进程维护索引、watcher 增量更新（投入最大）。
- **C1 Sidebar 虚拟化**：**折叠目录已懒加载（展开才 `loadDir`），只有同时展开很多大目录时渲染行数才上千**。虚拟化要扁平化可见行 + windowing，但与递归嵌套、拖拽、右键菜单、内联重命名 / 新建、跟随当前文件自动展开滚动等强耦合，**回归面大、收益窄**，建议最后或不做。
- **Tabs / StatusBar memo**：非打字场景（find、hover、palette、主题切换等）下避免无谓重渲染，收益有限，按需再做。

---

## 三、本地测量方法（验证与基线）

GUI 需在本地打包版上跑（开发沙盒无法启动 Electron）。建议三个标定态对比：

- **A. 冷启动 + 1 个小文件** —— 量"刚启动就偏高"。
- **B. 开 20~30 个 `.md`（默认 KeepEditor，不切 Milkdown）** —— 量多 tab、轻路径。
- **C. 把其中若干切到 Milkdown / 含 mermaid + 公式 + 图片** —— 量重路径。

手段：任务管理器按进程看内存，或主进程 `app.getAppMetrics()`；渲染进程用 DevTools Memory 打 Heap Snapshot 按 Retained Size 排序；"打开→关闭 N 个 tab→强制 GC→再快照"验证关闭后是否真正释放。每完成一项优化重跑 A/B/C 对比前后，并回归核心功能（切 tab、split、mermaid / 公式渲染、KeepEditor 零 diff 保存、关闭未保存提示），遵循 [CLAUDE.md](../CLAUDE.md) 的跨平台约定。
