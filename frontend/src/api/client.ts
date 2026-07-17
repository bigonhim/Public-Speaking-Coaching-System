// Thin, typed fetch wrapper around the coach API. Requests are origin-relative;
// the Vite dev server proxies /api to the Django backend (see vite.config.ts).

import type {
  LevelState,
  Progress,
  SessionDetail,
  SessionListItem,
  Topic,
} from './types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?')
  }
  if (!resp.ok) {
    let detail = `Request failed (${resp.status})`
    try {
      const body = await resp.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* non-JSON error body — keep the default */
    }
    throw new ApiError(resp.status, detail)
  }
  return (await resp.json()) as T
}

export function getRandomTopic(category = 'general'): Promise<Topic> {
  return request<Topic>(`/topics/random?category=${encodeURIComponent(category)}`)
}

export async function createSession(
  audio: Blob,
  topicId: number,
  durationSec: number,
): Promise<number> {
  const form = new FormData()
  form.append('audio', audio, 'take.webm')
  form.append('topic_id', String(topicId))
  form.append('duration_sec', String(durationSec))
  const { session_id } = await request<{ session_id: number }>('/sessions', {
    method: 'POST',
    body: form,
  })
  return session_id
}

export function getSession(id: number): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${id}`)
}

export function listSessions(limit = 20, offset = 0): Promise<SessionListItem[]> {
  return request<SessionListItem[]>(`/sessions?limit=${limit}&offset=${offset}`)
}

export function getProgress(): Promise<Progress> {
  return request<Progress>('/progress')
}

export function getLevel(): Promise<LevelState> {
  return request<LevelState>('/level')
}
