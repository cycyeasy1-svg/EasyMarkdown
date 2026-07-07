// Eager-mount Milkdown's code-block node view (fixes the code-block "page
// jump", historical issue #25).
//
// CodeMirrorBlock (@milkdown/components/code-block) lazy-mounts its CodeMirror
// editor via a shared IntersectionObserver (rootMargin 200px): a plain <pre>
// placeholder while off-screen, the real editor once in view, and a teardown
// back to the placeholder after 5s off-screen. The placeholder↔mounted height
// delta (~127px on a 5-line block upstream) surfaces as a viewport jump:
// scroll anchoring absorbs it during pure scrolling (see the
// `overflow-anchor: auto` rule on .editor-scroll), but Chromium disables
// anchoring while a contenteditable holds a selection — so "scroll to a code
// block, stop, select text → the page jumps".
//
// Fix: mount eagerly and never tear down, so a block's height is stable for
// its whole life — no delta, nothing for anchoring to miss. CodeMirrorBlock is
// exported, so we adjust its prototype here (our code, not a node_modules
// edit):
//   - renderPlaceholder() runs once, in the constructor, after every field
//     initializeCodeMirror() needs is assigned — swapping it for an immediate
//     initializeCodeMirror() is safe, and the IntersectionObserver's later
//     "isIntersecting" callback is a no-op via the `initialized` guard.
//   - scheduleTeardown() becomes a no-op; destroy() still cleans up directly
//     (app.unmount + cm.destroy), so deleting a block doesn't leak.
//
// Why not a node view override: nodeViewCtx can ADD views (html/frontmatter do)
// but can't replace a $view-registered component view, and
// editorViewOptionsCtx.nodeViews would clobber every component node view (see
// the renderHtmlNodeView note in CLAUDE.md).
//
// Cost: CodeMirror instances for all code blocks are created at parse time.
// Fine for typical docs — heavy docs never reach Crepe (isHeavyDoc routes them
// to keep/plain mode), and mermaid previews stay cheap (editor-mermaid.js has
// its own render queue + cache). All other CodeMirrorBlock behavior (language
// picker, copy, mermaid renderPreview, in-block search) is untouched.
import { CodeMirrorBlock } from '@milkdown/components/code-block'

const proto = CodeMirrorBlock?.prototype

// If a future @milkdown/components bump renames these hooks the patch silently
// stops applying and the lazy-mount jump returns — warn so a dependency bump
// can't quietly re-introduce the bug.
if (
  typeof proto?.renderPlaceholder !== 'function' ||
  typeof proto?.initializeCodeMirror !== 'function' ||
  typeof proto?.scheduleTeardown !== 'function'
) {
  console.warn(
    '[easymarkdown] code-block eager-mount patch: CodeMirrorBlock API changed — the scroll-jump fix no longer applies.'
  )
} else {
  proto.renderPlaceholder = function eagerRenderPlaceholder() {
    this.initializeCodeMirror()
  }
  proto.scheduleTeardown = function noOpTeardown() {
    // Keep the editor mounted so the block's height never reverts to the
    // shorter placeholder.
  }
}
