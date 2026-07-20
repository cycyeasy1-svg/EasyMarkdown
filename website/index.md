---
title: EasyMarkdown — 像操作 Excel 一样操作 Markdown
description: 免费开源的桌面 Markdown 编辑器：保持模式零差分保存，表格可按列筛选，标签页 + 文件树工作区，Windows / macOS + VSCode 扩展，MIT 协议
url: https://cycyeasy1-svg.github.io/EasyMarkdown/
version: v1.2.0
license: MIT
author: Easy Chen (@cycyeasy1-svg)
---

# EasyMarkdown — 像操作 Excel 一样操作 Markdown

> 免费 · 开源 · 不要账号

AI 产出的 Markdown，最终要由人来确认。EasyMarkdown 让这件事不再痛苦。

- **下载 Windows 版**（.exe，NSIS）/ **下载 macOS 版**（.dmg，Apple Silicon & Intel）/ **Android APK**：https://github.com/cycyeasy1-svg/EasyMarkdown/releases/latest
- 构建未签名 — Windows：更多信息 → 仍要运行 · macOS：右键 → 打开

## 未编辑的字节，一个都不动

多数所见即所得编辑器保存时会把整篇文档重新序列化：表格对齐被重排，列表符号 `-` 被改成 `*`，空行被增删。哪怕你只改了一个词。

EasyMarkdown 默认用**保持模式**：原文是唯一正本，渲染只是只读视图，编辑被限定在单元格或整块源码里，保存只回写改动的那几行。

同一篇设计书，同一处修改：

| 保存方式 | git diff |
| --- | --- |
| 全文重新序列化 | `18 insertions(+), 18 deletions(-)` |
| 保持模式 | `1 insertion(+), 1 deletion(-)` |

需要自由排版时，一键切到并存的 Milkdown 模式（斜杠菜单、LaTeX、Mermaid、图片预览）。

## 它能做什么

| # | 功能 | 说明 | 快捷键 |
| --- | --- | --- | --- |
| 01 | 保持模式 | 原文即正本，零差分保存。双击单元格或点「内容编辑」就地改源码。 | — |
| 02 | 表格即数据 | 按列筛选（多列交集、值搜索）、行列增删、分级复制、宽表吸顶表头。 | — |
| 03 | 工作区全文搜索 | 打开的文件夹内跨文件搜索，支持正则，点结果跳到对应行。 | Ctrl/⌘ Shift F |
| 04 | 标签页 | 双击一个文件，是多一个标签，不是多一个窗口。可拖拽排序、可固定。 | Ctrl/⌘ Tab |
| 05 | 文件夹工作区 | 整个文件夹挂在侧边栏，新建、重命名、删除都不用切出去。 | Ctrl/⌘ B |
| 06 | 日文排版 | 含假名的文档自动切日文字体，汉字按日文字形渲染，导出与打印同样生效。 | — |
| 07 | 富文本复制 | 复制自带格式，粘进微信公众号、邮件、Notion 都不丢样式。 | Ctrl/⌘ C |

更多：查找替换（Ctrl+H）、统一设置面板（Ctrl+,）、导出自包含 HTML（Ctrl+Shift+H）、导出 PDF、系统打印、命令面板、大纲面板、分屏、源码模式、自动保存、会话恢复、外部修改自动重载、中英日三语界面。

## 走进 VSCode

同一套保持模式内核打包成了 VSCode 扩展（v1.3.4）：`.md` 默认以保持视图打开，零差分行内编辑，Excel 式表格操作，与源码编辑器双向滚动同步。评审 AI 产出的设计书，不必离开 IDE。

## 六套主题

暖光、暖夜，以及四套莫兰迪：灰绿、豆沙、雾蓝、暮。另支持 Typora 兼容的自定义 `.css` 主题。

## 链接

- 官网：https://cycyeasy1-svg.github.io/EasyMarkdown/
- GitHub：https://github.com/cycyeasy1-svg/EasyMarkdown
- Releases：https://github.com/cycyeasy1-svg/EasyMarkdown/releases
- 完整事实（LLM 友好）：https://cycyeasy1-svg.github.io/EasyMarkdown/llms-full.txt
