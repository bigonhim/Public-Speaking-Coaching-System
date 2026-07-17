// Presentation metadata for the four scored components. Centralised so the
// results breakdown and the progress charts read as one system.

import type { ComponentKey, Metrics } from '../api/types'

export interface ComponentMeta {
  key: ComponentKey
  label: string
  color: string
  /** One-line explanation of what this component rewards. */
  blurb: string
  /** Human string for the underlying raw measurement, given a metrics object. */
  rawMetric: (m: Metrics) => string
}

const num = (v: number | null, digits = 0, fallback = '—') =>
  v === null || v === undefined ? fallback : v.toFixed(digits)

export const COMPONENTS: ComponentMeta[] = [
  {
    key: 'pace',
    label: 'Pace',
    color: '#0ea5e9',
    blurb: 'Speaking speed — full marks between 120 and 150 words per minute.',
    rawMetric: (m) => `${num(m.wpm)} wpm`,
  },
  {
    key: 'filler',
    label: 'Fillers',
    color: '#f59e0b',
    blurb: 'Fewer “um”, “like” and “you know” means a stronger delivery.',
    rawMetric: (m) => `${num(m.filler_per_min, 1)}/min · ${num(m.filler_count)} total`,
  },
  {
    key: 'pause',
    label: 'Pauses',
    color: '#8b5cf6',
    blurb: 'Brief pauses help; long silences and dead air cost points.',
    rawMetric: (m) =>
      `${num(m.long_pause_count)} long · ${num((m.silence_ratio ?? 0) * 100)}% silence`,
  },
  {
    key: 'relevance',
    label: 'Relevance',
    color: '#10b981',
    blurb: 'How closely your words stayed on the assigned topic.',
    rawMetric: (m) => `cosine ${num(m.relevance_similarity, 2)}`,
  },
]

export const OVERALL_COLOR = '#4f46e5'

/** Traffic-light colour for a 0..100 score. */
export function scoreTone(score: number | null): string {
  if (score === null) return '#94a3b8'
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
