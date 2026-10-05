// Thin, typed fetch wrapper around the coach API. Requests are origin-relative;
// the Vite dev server proxies /api to the Django backend (see vite.config.ts).
//
// Auth is a Django session cookie. It is HttpOnly, so there is nothing to
// attach by hand — but that also means unsafe requests must prove they came
// from our own page, which is what the X-CSRFToken header below does.

import type {
  LevelState,
  Progress,
  ScoringConfig,
  SessionDetail,
  SessionListItem,
  Topic,
  User,
} from './types'

const BASE = '/api'
const UNSAFE_METHODS = /^(POST|PUT|PATCH|DELETE)$/i
const CSRF_COOKIE = 'csrftoken'
const CSRF_HEADER = 'X-CSRFToken'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
  }
  return null
}

/** Ask the backend to (re)issue the CSRF cookie. */
async function fetchCsrfToken(): Promise<void> {
  try {
    await fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' })
  } catch {
    /* offline — the request that needed it will surface the real error */
  }
}

export async function ensureCsrfToken(): Promise<void> {
  if (!readCookie(CSRF_COOKIE)) await fetchCsrfToken()
}

// A 401 on any non-auth endpoint means the session lapsed underneath us. The
// AuthProvider registers here so it can drop to the signed-out state instead of
// letting the UI sit there retrying against a dead session.
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn
}

async function send(path: string, init: RequestInit, method: string): Promise<Response> {
  const headers = new Headers(init.headers)
  if (UNSAFE_METHODS.test(method)) {
    await ensureCsrfToken()
    const token = readCookie(CSRF_COOKIE)
    if (token) headers.set(CSRF_HEADER, token)
  }
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: 'same-origin' })
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()

  let resp: Response
  try {
    resp = await send(path, init, method)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?')
  }

  // A 403 on an unsafe request is almost always a stale CSRF token (the server
  // rotates it on login and logout). Refresh it and replay once — silently, so
  // a user who left a tab open overnight never sees a spurious failure. Safe to
  // retry: the original request was rejected before it could do anything.
  if (resp.status === 403 && UNSAFE_METHODS.test(method) && !init.signal?.aborted) {
    await fetchCsrfToken()
    try {
      resp = await send(path, init, method)
    } catch {
      throw new ApiError(0, 'Could not reach the server. Is the backend running?')
    }
  }

  if (resp.status === 401 && !path.startsWith('/auth/')) onSessionExpired?.()

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

  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// --- Auth -------------------------------------------------------------------
export function getMe(): Promise<User> {
  return request<User>('/auth/me')
}

export function register(name: string, email: string, password: string): Promise<User> {
  return postJson<User>('/auth/register', { name, email, password })
}

export function login(email: string, password: string, remember: boolean): Promise<User> {
  return postJson<User>('/auth/login', { email, password, remember })
}

export function logout(): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>('/auth/logout', {})
}

// --- Coach ------------------------------------------------------------------
export function getRandomTopic(category = 'general'): Promise<Topic> {
  return request<Topic>(`/topics/random?category=${encodeURIComponent(category)}`)
}

/** Map a MediaRecorder container to a file extension. The backend serves the
 *  recording back with a content type derived from this name, so a wrong
 *  extension is what makes playback silently fail on the results screen. */
function audioExtension(mimeType: string | null | undefined): string {
  const type = (mimeType || '').toLowerCase()
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'mp4'
  if (type.includes('mpeg')) return 'mp3'
  if (type.includes('wav')) return 'wav'
  return 'webm'
}

export async function createSession(
  audio: Blob,
  topicId: number,
  durationSec: number,
  mimeType?: string | null,
): Promise<number> {
  const form = new FormData()
  form.append('audio', audio, `take.${audioExtension(mimeType ?? audio.type)}`)
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

export function getScoringConfig(): Promise<ScoringConfig> {
  return request(`/scoring`)
}

export function deleteSession(id: number): Promise<void> {
  return request<void>(`/sessions/${id}`, { method: 'DELETE' })
}
