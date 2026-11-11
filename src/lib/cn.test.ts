import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('keeps the old signature: filters falsy, joins the rest', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
    expect(cn()).toBe('')
  })

  it('lets a LATER padding win — the reason Card can now own a default', () => {
    expect(cn('p-4', 'p-3')).toBe('p-3')
    expect(cn('p-4', 'p-8')).toBe('p-8')
    expect(cn('p-4', 'p-3.5')).toBe('p-3.5')
  })

  it('lets a later radius win', () => {
    expect(cn('rounded-2xl', 'rounded-xl')).toBe('rounded-xl')
    expect(cn('rounded-xl', 'rounded-2xl')).toBe('rounded-2xl')
  })

  it('lets a caller tint override the Card surface tokens', () => {
    expect(cn('bg-card', 'bg-brand-500/8')).toBe('bg-brand-500/8')
    expect(cn('border-line', 'border-brand-500/30')).toBe('border-brand-500/30')
    expect(cn('bg-card', 'bg-gold-400/10')).toBe('bg-gold-400/10')
    expect(cn('border-line', 'border-gold-400/40')).toBe('border-gold-400/40')
  })

  it('still lets skeleton cards swap the surface', () => {
    expect(cn('bg-card', 'bg-card-2')).toBe('bg-card-2')
  })

  it('does not let a hover variant eat the base class', () => {
    expect(cn('bg-card', 'hover:bg-card-2')).toBe('bg-card hover:bg-card-2')
    expect(cn('border-line', 'hover:border-brand-500/60')).toBe(
      'border-line hover:border-brand-500/60',
    )
  })

  it('does not merge the v4 important suffix, which is safe because it wins anyway', () => {
    const out = cn('h-10 w-10', 'h-9! w-9!')
    expect(out).toContain('h-9!')
    expect(out).toContain('h-10') // redundant, but !important still wins
  })

  it('keeps text-2xs as a SIZE, unlike text-tiny which would be eaten', () => {
    expect(cn('text-2xs', 'text-muted')).toBe('text-2xs text-muted')
    expect(cn('text-sm', 'text-2xs')).toBe('text-2xs')
    // The counter-example, pinned so the reason is visible:
    expect(cn('text-tiny', 'text-muted')).toBe('text-muted')
  })

  it('resolves text size and text colour independently', () => {
    // Same group → later wins.
    expect(cn('text-sm', 'text-xs')).toBe('text-xs')
    expect(cn('text-sm', 'text-muted')).toBe('text-sm text-muted')
    expect(cn('text-muted', 'text-brand-500')).toBe('text-brand-500')
  })
})
