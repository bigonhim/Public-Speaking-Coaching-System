// Display metadata for all seven rungs (mirrors backend levels.describe). The
// live current level / progress come from the /level endpoint; this table just
// lets the ladder render the names of not-yet-unlocked rungs.

export interface Rung {
  level: number
  name: string
  award: string
}

export const LADDER: Rung[] = [
  { level: 1, name: 'The Novice', award: 'First Voice' },
  { level: 2, name: 'The Apprentice', award: 'Finding Your Voice' },
  { level: 3, name: 'The Speaker', award: 'Steady Pace' },
  { level: 4, name: 'The Communicator', award: 'Clear Voice' },
  { level: 5, name: 'The Persuader', award: 'On Point' },
  { level: 6, name: 'The Orator', award: 'Commanding Presence' },
  { level: 7, name: 'The Master Orator', award: 'Master Orator' },
]
