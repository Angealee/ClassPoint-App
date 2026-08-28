import { twMerge } from 'tailwind-merge'

/**
 * Combine class names, with LATER classes winning conflicts.
 *
 * ── WHY THIS IS NOT A PLAIN JOIN ANY MORE ──────────────────────────────────
 * This used to be `classes.filter(Boolean).join(' ')`. That looks harmless and
 * is not: when two conflicting utilities both land in the class attribute, CSS
 * decides the winner by position in the STYLESHEET, not by position in the
 * string. Tailwind v4 emits utilities alphabetically, so the winner was
 * effectively arbitrary from the author's point of view.
 *
 * Measured in the built CSS before this change:
 *
 *   .border-brand-500/30 @24245  <  .border-line @25819   → border-line won
 *   .bg-brand-500/8      @28533  <  .bg-card     @30742   → bg-card won
 *   .p-3                 @47233  <  .p-4         @47314   → p-4 won
 *
 * So `<Card className="border-brand-500/30 bg-brand-500/8">` silently rendered
 * as a PLAIN card — both classes were dead. Four call sites were affected, and
 * because the old `cn` had been quietly eating overrides for months, developers
 * stopped attempting them: that is why the blast radius of this change is only
 * about ten sites rather than hundreds.
 *
 * With twMerge the caller's class wins, which is what every call site already
 * assumed. The signature is unchanged — nothing passes arrays or objects, so
 * `clsx` would be a second dependency for no benefit.
 *
 * ⚠ If you ever add a CUSTOM `text-*` or `rounded-*` token name, twMerge will
 * classify the unknown word as a COLOUR, not a size, and silently drop it when
 * it meets a real colour class. Such a token needs an `extendTailwindMerge`
 * classGroup entry in the same commit — see cn.test.ts.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean) as string[])
}
