---
doc_version: 1
doc_status: active
doc_owner: maintainers
last_verified: 2026-08-09
---

# EasyMarkdown 开发文档

这套文档记录 **EasyMarkdown** 的架构、功能实现方式、开发/打包流程，以及开发过程中发现并修复的关键问题与设计决策。

> EasyMarkdown 是一款温暖、现代的 Markdown 编辑器 —— 一个 Typora 替代品，核心理念：**每个文件都在同一个窗口里作为标签页打开**，而不是新开一个程序。

## 文档目录

| 文档 | 内容 |
| --- | --- |
| [architecture.md](./architecture.md) | 技术栈、进程模型、目录结构、关键模块与数据流 |
| [features.md](./features.md) | 每个功能的用法 + 实现方式（对应到具体文件） |
| [implementation-notes.md](./implementation-notes.md) | 开发过程中踩的坑、关键 bug 的根因与修法、设计决策 |
| [performance.md](./performance.md) | 性能优化：内存与渲染卡顿的根因、已做改动与待办方向 |
| [startup-resume-performance.md](./startup-resume-performance.md) | 起動・復帰 performance の計測、対応履歴、残課題 |
| [engineering-maturity-roadmap.md](./engineering-maturity-roadmap.md) | 軽量な正式開発レベルへ移行するための P1〜P3 計画、受入条件、進捗 |
| [documentation-governance.md](./documentation-governance.md) | Document metadata、source of truth、link gate、archive の運用規約 |
| [quality-gates.md](./quality-gates.md) | Architecture import、boundary type、platform API、i18n、coverage、axe、dependency gate の運用規約 |
| [definition-of-done.md](./definition-of-done.md) | 全変更共通と S／M／L risk 別の完了条件、Ready／merge、exception policy |
| [feature-dossiers/README.md](./feature-dossiers/README.md) | リスク別 Feature Dossier、AC-ID／TEST-ID、設計・テスト review の運用規約 |
| [adr/README.md](./adr/README.md) | Architecture Decision Record の作成条件、status、index |
| [product-support-matrix.md](./product-support-matrix.md) | Desktop／Mobile／VS Code／Website の support tier、compatibility baseline、release gate |
| [release-evidence/README.md](./release-evidence/README.md) | Beta／Stable product を公開する際の release evidence と authorization 運用 |
| [release.md](./release.md) | Desktop release の品質 gate、署名、manual smoke、公開、rollback 手順 |
| [security-threat-model.md](./security-threat-model.md) | Electron／IPC／local file／release の trust boundary、脅威、対策、残課題 |
| [diagnostics-and-recovery.md](./diagnostics-and-recovery.md) | 構造化 local log、privacy redaction、診断 export、Error Boundary、safe mode の設計 |
| [development.md](./development.md) | 本地开发、构建、打包（Windows / macOS）、自动化测试方法 |
| [mobile.md](./mobile.md) | 移动端（iOS / Android · Capacitor）方案、接口适配、打包发布 |
| [mobile-usage.md](./mobile-usage.md) | 移动端**使用说明**(安装、界面、保存/导出等操作) |
| [archive/README.md](./archive/README.md) | 完了済み plan／roadmap の履歴 index（現行仕様ではない） |

## 一句话技术概览

Electron + Vite + React 外壳，编辑器引擎用 **Milkdown Crepe**（基于 ProseMirror 的所见即所得）。外壳（标签页、文件树、命令面板、大纲、主题、i18n、首页）全部自研。

## 快速开始

```bash
npm install        # 若 Electron 二进制下载被墙，先设镜像：
                   #   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dev        # 热重载开发模式
npm run build      # 打包 main + preload + renderer 到 out/
npm start          # 运行已构建的应用
npm run dist       # 打当前系统安装包（Windows NSIS / macOS dmg+zip）
```

> 仓库根目录的 [AGENTS.md](../AGENTS.md) 是 AI / 新同学的速查（命令、约定、跨平台规则），细节看本目录各篇。
