---
doc_version: 1
doc_status: active
doc_owner: maintainers
feature_id: FD-CODE-LINE-TABLE-EDIT
title: コードブロック行番号と Milkdown テーブル単一クリック編集
risk: M
status: verified
owner: maintainers
platforms: desktop-windows, desktop-macos, vscode, shared
last_verified: 2026-08-15
---

# コードブロック行番号と Milkdown テーブル単一クリック編集

## Context

Upstream `horseMD` の `0.12.62` 以降には、コードブロック行番号、PDF 出力への反映、Milkdown テーブル cell の単一クリック編集が含まれる。本 project は Keep を source-preserving editor として Desktop、VS Code、HTML LITE で共有し、Milkdown と Keep で異なる table interaction contract を持つため、upstream の DOM patch と CSS をそのまま移植できない。

## Goal

- Keep の共通 parser が生成する fenced code block に視覚的な行番号を表示し、Desktop、VS Code、HTML LITE で同じ source semantics を維持する。
- Milkdown の CodeMirror gutter を既存 theme と整合する行番号 UI として表示する。
- PDF／print／HTML export のコードブロックに、virtualized DOM ではなく Markdown source 全体から生成した行番号を含める。
- Milkdown table cell は単一クリックで caret を置いて編集できるようにする。
- Keep table は単一クリックで cell 選択、double click／Enter で編集する既存操作を維持する。

## Non-goal

- 行番号表示の user setting、開始番号、highlight range、コード実行機能は追加しない。
- Mermaid preview に行番号を重ねない。Mermaid source を code fallback として出力する場合だけ通常の行番号 contract を適用する。
- Keep table の単一クリック編集化、body-level floating cell toolbar の復活は行わない。
- PDF pagination engine、syntax highlighting、CodeMirror virtualization 自体は変更しない。

## UX

通常の fenced code block は左側に固定幅の gutter と 1 始まりの行番号を表示する。長い code line が折り返されても continuation は本文 column 内に収まり、gutter と重ならない。行番号は装飾情報であり、selection、copy、save、diff の source text に混入しない。

Milkdown table は cell 内を一度クリックすると caret が入り、そのまま入力できる。Table handle、row／column 操作、drag selection は既存挙動を維持する。Keep table では single click は選択のみで、double click または Enter が inline editor を開く。

## Data

新規永続 data、setting、session field は追加しない。行番号は document source から render 時に導出し、保存 Markdown へ書き込まない。Table interaction は ProseMirror transaction だけを更新する。

## Contract

- Keep code block は共通 parser から semantic line row を生成し、行番号は CSS counter の generated content とする。したがって DOM text、clipboard text、Markdown source に番号を含めない。
- Desktop、VS Code、HTML LITE は同じ Keep markup contract を使用し、platform stylesheet だけが色と spacing を担当する。
- PDF snapshot は ProseMirror code block node の完全な `textContent` から line row を再構成する。Visible CodeMirror DOM の mount／virtualization 状態を source of truth にしない。
- PDF／print／HTML export の stylesheet は同じ class contract を解釈し、gutter を含めて出力する。
- Milkdown table node view は cell 内の pointer／mouse down だけを ProseMirror に通し、cell 外の table controls には既存 `stopEvent` を委譲する。

## Migration

Document、session、setting の migration は不要である。既存 Markdown は再 open 時に自動的に新しい presentation を得る。Rollback 後も保存 data は完全互換である。

## Acceptance Criteria

### AC-CODETABLE-001 — Keep の行番号を三 platform で共有する

複数行、空行、long line を含む fenced code block を Desktop Keep、VS Code、HTML LITE で開くと、1 始まりの連続した行番号と code text が対応して表示される。行番号は保存 Markdown と copy text に含まれない。

### AC-CODETABLE-002 — Milkdown の CodeMirror gutter を一貫表示する

Milkdown code block は theme に従う opaque gutter と line number を表示し、active line、scroll、long line wrap でも code text と重ならない。

### AC-CODETABLE-003 — PDF が完全な source と行番号を出力する

未 mount／viewport 外を含む複数行 code block を PDF export すると、Markdown source の全行と対応する行番号が出力される。Print／HTML export も同じ class contract を表示する。

### AC-CODETABLE-004 — Milkdown table を単一クリックで編集する

Milkdown table cell を一度クリックして文字を入力すると対象 cell が更新される。Cell 外 control event は既存 table node view が処理し、editor crash や二重 patch が発生しない。

### AC-CODETABLE-005 — Keep table の interaction contract を維持する

Keep table cell の single click は選択だけを行い、inline editor を開かない。Double click または Enter では従来どおり編集できる。

## Test Mapping

対応表は [test-spec.md](./test-spec.md) を source of truth とする。

## Rollout

最初に共通 markup と PDF snapshot の unit test を固定し、Desktop／VS Code／HTML LITE build を同時に通す。その後、built Electron E2E で actual Milkdown／Keep interaction を確認し、生成 PDF を rasterize して gutter と全 code line を目視検証する。Feature flag は使用しない。

## Rollback

共通 code row renderer、stylesheet、Milkdown table node-view patch は互いに独立して除去できる。いずれを rollback しても Markdown source、session、workspace file の migration は不要である。

## Open Questions

- 行番号 display setting は利用者需要と accessibility feedback を確認して別 feature として判断する。
- Syntax highlight と PDF gutter の色 token 共通化は theme export contract の整理時に検討する。
