import { describe, expect, it } from 'vitest'
import { cn } from './cn'

/**
 * Pins the conflict-resolution behaviour that primitives now depend on.
 *
 * Before this, `cn` was a plain join and the winner of a conflict was decided by
 * alphabetical position in Tailwind v4's generated stylesheet — so a caller's
 * override could be silently dead. `Card` therefore shipped with no padding at
 * all, which is how card padding fragmented across seven values.
 *
 * These tests exist so that stops being true by accident.
 */
describe('cn', () => {
  it('keeps the old signature: filters falsy, joins the rest', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
    expect(cn()).toBe('')
  })

  it('lets a LATER padding win — the reason Card can now own a default', () => {
    // Alphabetically .p-3 precedes .p-4, so the old join rendered p-4 here.
    expect(cn('p-4', 'p-3')).toBe('p-3')
    expect(cn('p-4', 'p-8')).toBe('p-8')
    expect(cn('p-4', 'p-3.5')).toBe('p-3.5')
  })

  it('lets a later radius win', () => {
    expect(cn('rounded-2xl', 'rounded-xl')).toBe('rounded-xl')
    expect(cn('rounded-xl', 'rounded-2xl')).toBe('rounded-2xl')
  })

  /**
   * The four cards that were rendering plain. These assertions ARE the bug fix:
   * a caller's tint must survive Card's own `bg-card` / `border-line`.
   */
  it('lets a caller tint override the Card surface tokens', () => {
    expect(cn('bg-card', 'bg-brand-500/8')).toBe('bg-brand-500/8')
    expect(cn('border-line', 'border-brand-500/30')).toBe('border-brand-500/30')
    expect(cn('bg-card', 'bg-gold-400/10')).toBe('bg-gold-400/10')
    expect(cn('border-line', 'border-gold-400/40')).toBe('border-gold-400/40')
  })

  it('still lets skeleton cards swap the surface', () => {
    expect(cn('bg-card', 'bg-card-2')).toBe('bg-card-2')
  })

  /**
   * A `hover:` utility is a DIFFERENT class group from its base — merging them
   * would break every interactive card, which sets a base colour and a hover
   * colour together.
   */
  it('does not let a hover variant eat the base class', () => {
    expect(cn('bg-card', 'hover:bg-card-2')).toBe('bg-card hover:bg-card-2')
    expect(cn('border-line', 'hover:border-brand-500/60')).toBe(
      'border-line hover:border-brand-500/60',
    )
  })

  /**
   * KNOWN LIMITATION, pinned so it is not rediscovered as a bug.
   *
   * tailwind-merge does not recognise Tailwind v4's TRAILING `!` suffix, so
   * `h-9!` is not treated as conflicting with `h-10` and both survive the merge.
   *
   * This is harmless: `h-9!` compiles to `height: … !important`, which beats a
   * plain `h-10` regardless of stylesheet order or merge behaviour. The only
   * cost is a redundant class in the attribute. Two files use the suffix, both
   * for Avatar sizing on the podium.
   *
   * If that ever stops being harmless, the fix is to drop the `!` at those call
   * sites rather than to configure twMerge — the `!` was only ever there to beat
   * the old naive join.
   */
  it('does not merge the v4 important suffix, which is safe because it wins anyway', () => {
    const out = cn('h-10 w-10', 'h-9! w-9!')
    expect(out).toContain('h-9!')
    expect(out).toContain('h-10') // redundant, but !important still wins
  })

  it('resolves text size and text colour independently', () => {
    // Same group → later wins.
    expect(cn('text-sm', 'text-xs')).toBe('text-xs')
    // Different groups → both survive. If this ever fails for a CUSTOM size
    // name, twMerge has classified it as a colour and it needs a classGroup
    // entry (see the warning in cn.ts).
    expect(cn('text-sm', 'text-muted')).toBe('text-sm text-muted')
    expect(cn('text-muted', 'text-brand-500')).toBe('text-brand-500')
  })
})
