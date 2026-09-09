# Speaking Coach — Web-Based Public Speaking Coaching System

A local-first web app for practising impromptu public speaking. You record a
spoken response to a randomly assigned topic; the system transcribes it,
measures delivery quality, scores it with a **transparent, rule-based rubric**,
and tracks improvement through a **seven-level gamified progression** — while a
virtual audience reacts to your voice in real time.

> **Owner:** Langat Achim Kipkorir · Dedan Kimathi University of Technology (BSc Computer Science)
> Final-year project. Build spec: [`HANDOFF.md`](HANDOFF.md) · Detailed plan: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)

---

## Core principles

1. **Transparency over cleverness.** Every score is explainable from the screen: each of the four components shows its raw metric, its 0–100 score, its weight, and how many points it contributes. No ML black-box scoring.
2. **Config over hardcoding.** Every weight and threshold lives in [`backend/coach/config/scoring.yaml`](backend/coach/config/scoring.yaml). Change scoring without touching code.
3. **Pure, framework-free core.** `metrics.py`, `scoring.py`, `feedback.py`, `levels.py` contain **no Django imports** — plain data in, plain data out — so the academic core is unit-testable and provable (94 tests).
4. **Local, CPU-only, private.** No cloud AI, no paid APIs, runs on a mid-range laptop. Accounts exist so several people can share one install, but the data never leaves it: each account sees only its own recordings, transcripts and progression.

---

## Architecture

```
Project/
├── backend/     Django 5 + Django Ninja API, faster-whisper, sentence-transformers
├── frontend/    React + Vite + TypeScript + Tailwind SPA
└── data/        sqlite db + uploaded audio (gitignored)
```

- **Transcription:** `faster-whisper` (CTranslate2), CPU `int8`, word timestamps. Loaded once, lazily.
- **Topic relevance:** `sentence-transformers` (`all-MiniLM-L6-v2`) cosine similarity. Loaded once, lazily.
- **Analysis is synchronous** (no Celery/Redis): this is a single-user tool; a ~10–30s blocked request harms nobody and the UI shows a real loading state.

---

## Prerequisites

- **Python 3.11+**
- **Node.js 20.19+** (or 22.12+) — Vite 7's recommended minimum. It runs on 20.17 with a warning.
- ~2 GB free disk for the ML models (downloaded on first analysis).

---

## Setup & run

Open two terminals.

### 1. Backend (`http://localhost:8000`)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows PowerShell
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt

python manage.py migrate
python manage.py seed_topics       # 40 public-speaking prompts
python manage.py runserver
```

- API docs (OpenAPI): <http://localhost:8000/api/docs>
- Admin (data inspection): <http://localhost:8000/admin> — run `python manage.py createsuperuser` first.

Optional — populate a demo history without recording (`--email` picks the
account to fill; omit it to fill the pre-accounts bucket):

```bash
python manage.py seed_fake_sessions --reset --count 12 --email you@example.com
```

If you practised with a build from before accounts existed, those sessions are
still there with no owner. Register in the app, then claim them:

```bash
python manage.py claim_legacy_data --email you@example.com   # --dry-run to preview
```

### 2. Frontend (`http://localhost:5173`)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173> and create an account. The Vite dev server proxies
`/api` to the backend, so the SPA and the API share an origin — no CORS setup,
and the session cookie is first-party.

**First recording is slow** — the Whisper and embedding models download and load
on the first `POST /sessions` (tens of seconds). Subsequent recordings are fast;
the models stay in memory.

---

## Accounts & the sign-in reel

Signing in plays **the Hall of Voices** — a short reel of history's great
speakers (King, Obama, Mandela, Maathai, Yousafzai, Churchill), each slide
carrying a *craft note* that ties what that speaker did to what Cadence measures
in you. It ends by handing you to the dashboard. Skippable at any point (`Esc`),
replayable from the account menu, and it respects `prefers-reduced-motion` by
dropping auto-advance and footage entirely.

Everything about the reel lives in
[`frontend/src/data/voices.ts`](frontend/src/data/voices.ts) — the roster,
quotes, craft notes, colours, timing and clip sources.

**About the footage.** Each voice can be backed by a self-hosted file
(`frontend/public/voices/`, see the README there), a YouTube embed, or nothing —
in which case a designed generated backdrop carries the slide. The six shipped
IDs were re-checked on 2026-09-09: all resolve, carry the speech they claim, and
allow embedding. That can still change — third-party uploads get removed, go
private, block embedding, or vary by country — so footage is treated as
unreliable by design. A slide reveals its clip only once the player confirms it
is *actually playing*; a clip that errors, is blocked, or simply never starts is
dropped for the rest of the reel and that slide falls back to the backdrop. Set
`USE_ARCHIVE_FOOTAGE = false` for a typography-only reel with no third-party
requests at all. If you publish this anywhere public, read the copyright note in
`frontend/public/voices/README.md` first.

**About the sound.** A slide quotes one specific sentence; the clip behind it is
a whole speech. Playing a 13-minute address from 0:00 while the screen quotes
its closing line means you read one sentence and hear another — which is why
sound is opt-in per clip via `soundSafe` in `voices.ts`. Clips cut tightly
around their quote (Mandela, Malala, Churchill) offer a "turn on sound" control;
the longer speeches (King, Obama, Maathai) play as silent wallpaper until
someone watches them, writes the quote's real offset into `startSeconds` and
flips the flag. The reel never offers audio it cannot vouch for.

### How auth works

- Django session cookie (HttpOnly) — **no token in `localStorage`**, so an XSS
  cannot read the credential.
- Unsafe requests carry the CSRF token in `X-CSRFToken`. `/auth/login` and
  `/auth/register` check it explicitly: without that, an attacker can silently
  sign a victim into the *attacker's* account and collect their practice.
- Passwords go through Django's validators (min 8, not common, not numeric-only,
  not similar to your name/email). The sign-up form mirrors these live.
- Repeated failed sign-ins are throttled per IP + email.
- Audio is served only by `GET /api/sessions/{id}/audio`, which checks
  ownership. `MEDIA_ROOT` is not mounted — a static mount has no idea who owns
  a file.
- The API is built with `auth=django_auth`, so **every new endpoint is private
  by default** and must opt out explicitly.

---

## Configuration

### Whisper model size

Set `WHISPER_MODEL_SIZE` before starting the backend (`tiny` | `base` | `small`
| `medium` | `large`). Default `small` (fast, dev). Use `medium` for accuracy.

```bash
# PowerShell
$env:WHISPER_MODEL_SIZE = "medium"; python manage.py runserver
```

### Changing scoring weights & thresholds

Edit [`backend/coach/config/scoring.yaml`](backend/coach/config/scoring.yaml)
and restart the backend. **Nothing is hardcoded** — pace band, filler limits,
pause penalties, relevance similarity bounds, feedback triggers, and all seven
level rules live there. Filler word lists live in
[`backend/coach/config/fillers.yaml`](backend/coach/config/fillers.yaml).

Every number a user sees is traceable to these files. Because the config is
cached, changes take effect on restart.

> These values are **starting points to be calibrated** against human ratings —
> not ground truth. The raw MiniLM cosine similarity is always stored, so the
> relevance mapping can be re-tuned without re-recording.

---

## Testing

```bash
cd backend
.venv\Scripts\pytest
```

The pure academic core (`metrics`, `scoring`, `levels`) is tested with
hand-computed synthetic fixtures — boundary values and clamping — never against
live Whisper output. API tests mock transcription/embedding so they run fast and
deterministically. **102 tests.**

`tests/test_auth.py` covers registration, sign-in, throttling and CSRF;
`tests/test_api.py` additionally proves that every endpoint refuses anonymous
callers and that one account cannot see, stream or delete another's sessions.

---

## What it measures (the rubric)

| Component | Weight | Rewards |
|-----------|--------|---------|
| Pace | 25% | 120–150 words/min |
| Fillers | 25% | few "um / like / you know" per minute |
| Pauses | 15% | brief pauses; penalises long silences & walls of speech |
| Relevance | 35% | staying on the assigned topic (embedding cosine) |

**Overall** = weighted sum. The **seven levels** (Novice → Master Orator) unlock
on delivery milestones and are **monotonic** — they never regress.

The **virtual audience** reacts only to your voice (volume, silence, speech
rate) via the Web Audio API — never to your words. It is a confidence-building
tool through graduated exposure; it is **not** therapy and makes no claim to
treat anxiety.

---

## Stack notes / deviations from the original spec

The Vite scaffold provides current-major versions that are compatible supersets
of the versions named in `HANDOFF.md`:

- **React 19** (spec said 18) — compatible; no API differences used here.
- **react-router-dom 7**, **Recharts 3** — current majors, same APIs used.
- **Vite 7** (pinned) instead of the scaffold's Vite 8, whose rolldown engine
  ships a native binary that fails to install reliably on Windows/OneDrive.

Everything else follows the decided stack exactly (Django Ninja, faster-whisper,
sentence-transformers, Tailwind, DiceBear, MediaRecorder + Web Audio).

## Out of scope (deliberately)

No video/camera/facial or pitch/prosody analysis · no *social* features
(accounts exist purely to keep one person's practice separate from another's —
there is no sharing, following or leaderboard) · no password reset or email
sending · no interview mode (the `Topic.category` field is kept pluggable,
nothing more) · no task queue · no Django REST Framework · no paid/cloud AI.
```
