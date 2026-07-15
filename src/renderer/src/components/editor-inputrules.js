import { inputRulesCtx } from '@milkdown/kit/core'
import { emphasisSchema } from '@milkdown/kit/preset/commonmark'
import { markRule } from '@milkdown/kit/prose'
import { $inputRuleAsync } from '@milkdown/kit/utils'

// Milkdown 7.21.2 ships the underscore-emphasis regexp without an end anchor.
// ProseMirror input rules require matches to end at the caret; otherwise their
// range math is based on the wrong substring. A loaded literal such as
// `a\_b\_c` therefore gets corrupted when Enter emits a trailing text input:
// one character is deleted, a suffix is italicized, and the paragraph is not
// split. Replace only that upstream rule with the same regexp anchored at `$`.
const UNSAFE_UNDERSCORE_EMPHASIS = /\b_(?![_\s])(.*?[^_\s])_\b/
const SAFE_UNDERSCORE_EMPHASIS = /\b_(?![_\s])(.*?[^_\s])_\b$/

function isUnderscoreEmphasisRule(rule) {
  if (rule?.match?.flags !== SAFE_UNDERSCORE_EMPHASIS.flags) return false
  return (
    rule.match.source === UNSAFE_UNDERSCORE_EMPHASIS.source ||
    rule.match.source === SAFE_UNDERSCORE_EMPHASIS.source
  )
}

export function createSafeUnderscoreEmphasisInputRule() {
  // Create this timer-backed plugin per Editor instance. Rich tabs stay mounted
  // concurrently, and Milkdown's async-rule timer carries instance-local state.
  return $inputRuleAsync(async (ctx) => {
    // Remove the unsafe 7.21.2 form, or an already-fixed upstream form after a
    // future dependency update, so this editor always ends up with one rule.
    ctx.update(inputRulesCtx, (rules) => rules.filter((rule) => !isUnderscoreEmphasisRule(rule)))

    return markRule(SAFE_UNDERSCORE_EMPHASIS, emphasisSchema.type(ctx), {
      getAttr: () => ({ marker: '_' }),
      updateCaptured: ({ fullMatch, start }) =>
        !fullMatch.startsWith('_')
          ? { fullMatch: fullMatch.slice(1), start: start + 1 }
          : {}
    })
  }, 'SafeUnderscoreEmphasisInputRuleReady')
}
