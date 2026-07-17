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
3. **Pure, framework-free core.** `metrics.py`, `scoring.py`, `feedback.py`, `levels.py` contain **no Django imports** — plain data in, plain data out — so the academic core is unit-testable and provable (58 tests).
4. **Single-user, local, CPU-only.** No accounts, no cloud AI, no paid APIs. Runs on a mid-range laptop.

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

Optional — populate a demo history without recording:

```bash
python manage.py seed_fake_sessions --reset --count 12
```

### 2. Frontend (`http://localhost:5173`)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/media` to
the backend, so no CORS setup is needed for local use.

**First recording is slow** — the Whisper and embedding models download and load
on the first `POST /sessions` (tens of seconds). Subsequent recordings are fast;
the models stay in memory.

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
deterministically. **58 tests.**

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

No video/camera/facial or pitch/prosody analysis · no authentication or
multi-user/social features · no interview mode (the `Topic.category` field is
kept pluggable, nothing more) · no task queue · no Django REST Framework · no
paid/cloud AI.
```
