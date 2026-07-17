// TypeScript mirrors of the Django Ninja response schemas (backend/coach/schemas.py).
// Kept in lockstep with the API contract in HANDOFF.md §7.

export interface Topic {
  id: number
  text: string
  category: string
}

export interface Metrics {
  wpm: number | null
  filler_count: number | null
  filler_per_min: number | null
  pause_count: number | null
  long_pause_count: number | null
  silence_ratio: number | null
  relevance_similarity: number | null
}

export interface Scores {
  pace: number | null
  filler: number | null
  pause: number | null
  relevance: number | null
  overall: number | null
}

export interface Weights {
  pace: number
  filler: number
  pause: number
  relevance: number
}

export interface Word {
  word: string
  start: number
  end: number
}

export interface SessionDetail {
  id: number
  created_at: string
  topic_text: string
  duration_sec: number
  transcript: string
  metrics: Metrics
  scores: Scores
  weights: Weights
  feedback: string[]
  words: Word[]
}

export interface SessionListItem {
  id: number
  created_at: string
  topic_text: string
  overall_score: number | null
}

export interface ProgressPoint {
  created_at: string
  overall: number | null
  pace: number | null
  filler: number | null
  pause: number | null
  relevance: number | null
}

export interface Progress {
  sessions: ProgressPoint[]
  baseline_overall: number | null
  session_count: number
}

export interface LevelBadge {
  level: number
  name: string
  award: string
}

export interface LevelState {
  current_level: number
  name: string
  award: string
  next_level: number | null
  next_name: string | null
  progress_fraction: number
  progress_text: string
  unlocked: LevelBadge[]
}

// The four scored components, in display order. `key` matches Scores/Weights.
export type ComponentKey = 'pace' | 'filler' | 'pause' | 'relevance'
