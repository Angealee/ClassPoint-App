/**
 * Student Space's quiet identity: a faint violet→indigo glow and a dot-grid
 * starfield behind the top of a Space screen. Purely decorative — absolutely
 * positioned, behind content, and never catches a tap. The parent must be
 * `relative`. `.cp-grid` carries a mask, so it goes on this decorative child
 * and never on a content box (see the Era 7.0 note).
 */
export function SpaceGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-64">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-500/12 via-indigo-500/5 to-transparent" />
      <div className="cp-grid absolute inset-0 opacity-70" />
    </div>
  )
}
