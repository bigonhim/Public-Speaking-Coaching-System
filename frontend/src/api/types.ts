// TypeScript mirrors of the Django Ninja response schemas (backend/coach/schemas.py).
// Kept in lockstep with the API contract in HANDOFF.md §7.

export interface User {
  id: number
  name: string
  email: string
  /** 1–2 letters for the avatar, derived server-side from the display name. */
  initials: string
  joined_at: string
  session_count: number
  /** True until the account has analysed its first take. */
  is_new: boolean
}

export interface Topic {
  id: number
  text: string
  category: string
}

/** Where a take's prompt came from: a drawn topic, or one the speaker typed.
 *  Own-topic takes are scored but only count towards the delivery levels. */
export type TopicSource = 'random' | 'custom'

/** What a take answers when it is submitted: exactly one of the two. */
export type TopicChoice = { topicId: number } | { topicText: string }

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
  topic_source: TopicSource
  duration_sec: number
  transcript: string
  audio_url: string | null
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
  topic_source: TopicSource
  overall_score: number | null
}

export interface ProgressPoint {
  created_at: string
  overall: number | null
  pace: number | null
  filler: number | null
  pause: number | null
  relevance: number | null
  topic_source: TopicSource
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

/** GET /scoring — the scorer's own settings (backend/coach/config/*.yaml). */
export interface ScoringConfig {
  weights: Weights
  /** Takes shorter than this are refused by the server, not scored. */
  min_session_sec: number
  /** The recorder stops itself here; longer takes are refused. */
  max_session_sec: number
  custom_topic_min_chars: number
  custom_topic_max_chars: number
  pace_target_min: number
  pace_target_max: number
  pause_min_sec: number
  long_pause_sec: number
  fillers: { single: string[]; multi: string[][] }
}

// The four scored components, in display order. `key` matches Scores/Weights.
export type ComponentKey = 'pace' | 'filler' | 'pause' | 'relevance'
