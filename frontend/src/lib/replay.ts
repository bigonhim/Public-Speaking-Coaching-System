// The take, laid out along its own timeline: where the speaker talked, how fast,
// where the fillers fell and where the silences were. Everything here is read
// off the word timestamps the backend already returns with a session.
//
// Fillers and pauses are found the way backend/coach/services/metrics.py
// counts them, using the lists and thresholds served by GET /scoring — so a
// marker on the replay is always one the score actually counted.

import type { Word } from '../api/types'

export interface FillerLists {
  single: string[]
  multi: string[][]
}

export interface FillerHit {
  /** Index of the filler's first word. */
  index: number
  /** How many words the filler spans ("you know" is two). */
  length: number
  start: number
  text: string
}

export interface Gap {
  start: number
  end: number
  long: boolean
}

// Python's string.punctuation plus the typographic marks metrics.py adds.
const EDGE_PUNCT = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~…—–“”‘’]+|[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~…—–“”‘’]+$/g

/** Mirror of metrics._normalize: trim, strip surrounding punctuation, lowercase. */
export function normalizeToken(token: string): string {
  return token.trim().replace(EDGE_PUNCT, '').toLowerCase()
}

/** Every filler in the take, in order. Singles and multi-word phrases are
 *  matched independently, as the scorer does (the lists are disjoint). */
export function findFillers(words: Word[], lists: FillerLists): FillerHit[] {
  const tokens = words.map((w) => normalizeToken(w.word))
  const singles = new Set(lists.single.map(normalizeToken))
  const multis = lists.multi.map((p) => p.map(normalizeToken)).filter((p) => p.length > 0)
  const hits: FillerHit[] = []

  tokens.forEach((t, i) => {
    if (singles.has(t)) hits.push({ index: i, length: 1, start: words[i].start, text: t })
  })
  for (const phrase of multis) {
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      if (phrase.every((p, k) => tokens[i + k] === p)) {
        hits.push({ index: i, length: phrase.length, start: words[i].start, text: phrase.join(' ') })
      }
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

/** Gaps between consecutive words that count as pauses. Leading and trailing
 *  silence is not a pause, matching the scorer. */
export function findPauses(words: Word[], pauseMinSec: number, longPauseSec: number): Gap[] {
  const gaps: Gap[] = []
  for (let i = 0; i < words.length - 1; i++) {
    const start = words[i].end
    const end = words[i + 1].start
    const gap = end - start
    if (gap >= pauseMinSec) gaps.push({ start, end, long: gap >= longPauseSec })
  }
  return gaps
}

/** Speaking rate across the take, as `count` bars scaled 0..1 against the
 *  take's own fastest stretch. A bar is 0 where nobody was speaking. */
export function rateContour(words: Word[], totalSec: number, count: number): number[] {
  const binSec = totalSec / count
  const perBin = new Array<number>(count).fill(0)
  const spoken = new Array<boolean>(count).fill(false)

  for (const w of words) {
    const mid = (w.start + w.end) / 2
    const b = Math.min(count - 1, Math.max(0, Math.floor(mid / binSec)))
    perBin[b] += 1
    // A long word can span several bins; mark them all as voiced.
    const first = Math.max(0, Math.floor(w.start / binSec))
    const last = Math.min(count - 1, Math.floor(w.end / binSec))
    for (let k = first; k <= last; k++) spoken[k] = true
  }

  // Smooth over neighbours so a bar reads as a stretch of speech, not a word.
  const smooth = perBin.map((_, i) => {
    let sum = 0
    let n = 0
    for (let k = i - 1; k <= i + 1; k++) {
      if (k >= 0 && k < count) {
        sum += perBin[k]
        n += 1
      }
    }
    return sum / n
  })
  const peak = Math.max(...smooth, 1e-9)
  return smooth.map((v, i) => (spoken[i] ? 0.25 + 0.75 * (v / peak) : 0))
}
