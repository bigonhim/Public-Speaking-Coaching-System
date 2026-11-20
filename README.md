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

The roster, quotes, craft notes and colours live in
[`frontend/src/data/voices.ts`](frontend/src/data/voices.ts).

**About the clips.** Each voice is backed by a short self-hosted clip in
`frontend/public/voices/`, cut tightly around the quoted sentence. The clip is
the slide's clock: the slide starts when the clip starts, each word lights at
the moment it is spoken, and the reel moves on when the clip ends — so the
sentence you read and the sentence you hear are always the same one. The reel
opens on a card that asks "with sound or without"; the answer is remembered, and
a sound control stays in the header on every slide. Nothing is fetched from a
third party at runtime.

The clips and their word timings are generated, not hand-cut:
`uv run tools/build_voices.py` (from `frontend/`) finds each quote inside a
longer recording by transcribing it, trims the clip, and writes
`src/data/voiceClips.json`. See
[`frontend/public/voices/README.md`](frontend/public/voices/README.md) for how
to change a line or a recording. A voice with no clip, or whose file is missing,
falls back to a timed slide over a designed generated backdrop; set
`USE_ARCHIVE_FOOTAGE = false` for that typography-only reel throughout. If you
publish this anywhere public, read the copyright note in that README first.

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

**Take length** is set in the `session:` block. A take must run at least
`min_graded_sec` (60 s) to be scored: shorter ones are refused by the server,
which checks both the browser's reported duration and the decoded audio, and
the stage discards them instead of uploading. Past the minimum a speaker can
keep going up to `max_sec` (10 min), where the recorder stops and submits by
itself. The cap exists because transcription runs on CPU while the request
waits; raise it if your machine transcribes faster.

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
deterministically. **125 tests.**

`tests/test_auth.py` covers registration, sign-in, throttling and CSRF;
`tests/test_api.py` additionally proves that every endpoint refuses anonymous
callers and that one account cannot see, stream or delete another's sessions;
`tests/test_custom_topic.py` covers own topics: validation, scoring against
the typed text, and that they reach the delivery levels but never the
relevance-based ones.

---

## Own topics

The Practice screen has a **Random | My own** switch. *Random* draws one of the
seeded prompts, as before. *My own* lets the speaker type what they want to
talk about (5–150 characters) and records against that.

Own-topic takes are analysed and scored exactly like random ones. Relevance is
measured against the text the speaker typed. They appear in the history and
the trend chart, tagged **Your topic**.

| Level | Rule reads | Own-topic takes count? |
|---|---|---|
| 1 The Novice | duration | yes |
| 2 The Apprentice | overall score (contains relevance) | no |
| 3 The Speaker | pace | yes |
| 4 The Communicator | fillers | yes |
| 5 The Persuader | relevance | no |
| 6 The Orator | overall + every component | no |
| 7 The Master Orator | overall | no |

Relevance is 35% of the score, and a speaker who writes their own prompt could
simply echo their planned speech (in testing, repeating the topic's words
scored a higher similarity than a real answer). So own topics only help with
the levels that measure *how* you speak, and the baseline is taken from the
first random-topic take.

API: `POST /api/sessions` takes **either** `topic_id` **or** `topic_text`,
never both and never neither. Each session records `topic_source`
(`random` | `custom`). `api.py` (`_leveling_sessions`) builds two pools, random
takes and all takes, and the pure `levels.py` judges `DELIVERY_LEVELS = {1, 3, 4}`
on the wider pool and every other level on random takes only. `levels.py` never
learns where a topic came from.

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
