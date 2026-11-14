/*
 * A deterministic starfield. The podium's night sky must look the same on every render and
 * every device, so it is generated from a fixed seed rather than Math.random(): a random sky
 * would reshuffle whenever the board re-rendered, which reads as the stars twitching.
 */
export interface Star {
  /** 0-100, percent of the layer. */
  x: number
  y: number
  r: number
  o: number
}

/** mulberry32: a small, well-distributed seeded generator. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeStars(
  seed: number,
  count: number,
  rMin: number,
  rMax: number,
  oMin = 0.35,
  oMax = 0.9,
): Star[] {
  const next = rng(seed)
  const out: Star[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      x: next() * 100,
      y: next() * 100,
      r: rMin + next() * (rMax - rMin),
      o: oMin + next() * (oMax - oMin),
    })
  }
  return out
}
