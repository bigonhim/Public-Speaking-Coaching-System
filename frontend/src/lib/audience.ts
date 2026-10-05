// Difficulty ladder for the virtual audience (HANDOFF.md §8). Bigger, tougher
// rooms unlock with level; the user may override the size manually.

export const ROOM_SIZES = [0, 3, 6, 9, 12] as const

export const ROOM_LABEL: Record<number, string> = {
  0: 'Empty room',
  3: 'Small (3)',
  6: 'Medium (6)',
  9: 'Large (9)',
  12: 'Full house (12)',
}

/** One-word captions printed under the room keys. */
export const ROOM_SHORT: Record<number, string> = {
  0: 'Empty',
  3: 'Small',
  6: 'Medium',
  9: 'Large',
  12: 'Full',
}

/** Default audience size for a level. */
export function defaultRoomSize(level: number): number {
  if (level <= 2) return 3
  if (level <= 4) return 6
  if (level <= 6) return 9
  return 12
}

/** Forgiveness derived from the visible crowd: bigger = tougher (decays faster).
 *  >1 forgiving, 1 normal, <1 tough. */
export function forgivenessForSize(size: number): number {
  if (size <= 3) return 1.3
  if (size <= 6) return 1.1
  if (size <= 9) return 1.0
  return 0.85
}
