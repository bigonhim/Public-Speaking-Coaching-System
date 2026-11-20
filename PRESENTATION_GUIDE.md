# Cadence: Technical Guide for Presenting

A study guide for presenting and defending this project. It explains how the
whole system works, why it was built that way, where it is weak, and what you
are likely to be asked.

Every number in this guide was checked against the code on the `redesign`
branch on 2 October 2026, and updated on 18 November 2026 for own topics.
The worked examples were run through the real scoring functions, and the
test suite was run (125 passed).

> **Naming.** The app calls itself **Cadence**. The repo and README call it
> **Speaking Coach**. They are the same project.

---

## Contents

1. [The project in 60 seconds](#1-the-project-in-60-seconds)
2. [Tech stack, and why each piece](#2-tech-stack-and-why-each-piece)
3. [Architecture](#3-architecture)
4. [Repository map](#4-repository-map)
5. [One take, end to end](#5-one-take-end-to-end)
6. [The analysis pipeline (the academic core)](#6-the-analysis-pipeline-the-academic-core)
7. [Levels and progression](#7-levels-and-progression)
8. [The live layer in the browser](#8-the-live-layer-in-the-browser)
9. [Data model](#9-data-model)
10. [API reference](#10-api-reference)
11. [Accounts and security](#11-accounts-and-security)
12. [Frontend architecture](#12-frontend-architecture)
13. [The welcome reel (Hall of Voices)](#13-the-welcome-reel-hall-of-voices)
14. [Testing](#14-testing)
15. [Configuration](#15-configuration)
16. [Running it, and a demo script](#16-running-it-and-a-demo-script)
17. [Design decisions you should be able to defend](#17-design-decisions-you-should-be-able-to-defend)
18. [Limitations and known weak spots](#18-limitations-and-known-weak-spots)
19. [Likely questions, with answers](#19-likely-questions-with-answers)
20. [Glossary](#20-glossary)
21. [State of the repo right now](#21-state-of-the-repo-right-now)

---

## 1. The project in 60 seconds

Cadence is a web app for practising **impromptu public speaking**. You get a
random topic, speak for at least a minute (up to ten) to a **virtual audience that reacts to
your voice in real time**, and then get a **score out of 100** made of four
parts (pace, fillers, pauses and relevance to the topic) with short written
coaching notes. Over many takes you climb **seven levels**, from Novice to
Master Orator.

The four ideas that make it a defensible computer science project:

| Principle                     | What it means in the code                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transparent scoring** | Scores come from simple rules, not a machine-learning model. Every component shows its raw measurement, its 0–100 score, its weight and the points it adds               |
|                               |                                                                                                                                                                           |
|                               |                                                                                                                                                                           |
| **Config over code**    | Every weight and threshold lives in [scoring.yaml](backend/coach/config/scoring.yaml). Scoring can change without touching code.                                           |
| **Pure, testable core** | `metrics.py`, `scoring.py`, `feedback.py` and `levels.py` import nothing from Django. Plain data goes in and plain data comes out, so they can be tested exactly. |
| **Local and private**   | Runs on a laptop CPU. No paid or cloud AI. Each account only ever sees its own recordings.                                                                                |

**A line worth memorising:** *AI measures, rules judge.* Machine learning is
used only to turn audio into words with timestamps (Whisper) and to compare
meaning (MiniLM). Deciding what is good or bad is done by plain, readable
rules.

---

## 2. Tech stack, and why each piece

### Backend (Python)

| Piece           | Technology                                                  | Why this choice                                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web framework   | **Django 5.1**                                        | Comes with the database layer (ORM), migrations, an admin panel, user accounts, session cookies and CSRF protection. Most of that would otherwise be hand-built.                                                                                  |
| API layer       | **Django Ninja 1.3**                                  | Endpoints are ordinary Python functions with type hints. Validation (Pydantic) and interactive API docs at `/api/docs` are generated from those hints. It is lighter than Django REST Framework, which the spec ruled out.                      |
| Database        | **SQLite**                                            | A single file (`data/app.db`) with no server to install. Right for a single-machine tool.                                                                                                                                                       |
| Speech-to-text  | **faster-whisper** (model `small`, `int8`, CPU)   | An open-source re-implementation of OpenAI's Whisper on the CTranslate2 engine; its authors report it as up to 4× faster than the original. Crucially it gives **a timestamp for every word**, which pace and pause measurement depend on. |
| Topic relevance | **sentence-transformers**, model `all-MiniLM-L6-v2` | A small (about 80 MB) model that turns text into a 384-number "meaning vector". Fast on CPU and good at judging whether two texts are about the same thing.                                                                                       |
| Config          | **PyYAML**                                            | Human-editable config files.                                                                                                                                                                                                                      |
| Tests           | **pytest + pytest-django**                            | Standard Python testing, with Django test-database support.                                                                                                                                                                                       |

### Frontend (TypeScript)

| Piece          | Technology                              | Why                                                                                                                                 |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| UI library     | **React 19**                      | Component model, hooks for the recorder and the live audio.                                                                         |
| Language       | **TypeScript**                    | API response types mirror the backend schemas, so a contract mismatch fails at compile time.                                        |
| Build tool     | **Vite 7**                        | Fast dev server with a proxy to Django. Pinned to 7 because Vite 8's native binary did not install reliably on Windows or OneDrive. |
| Styling        | **Tailwind CSS 3**                | Utility classes plus a custom colour and font system in [tailwind.config.js](frontend/tailwind.config.js).                           |
| Routing        | **react-router-dom 7**            | Pages and route guards.                                                                                                             |
| Charts         | **Recharts 3**                    | Progress trend lines.                                                                                                               |
| Audience faces | **DiceBear** (`personas` style) | Generates varied human-looking avatars in the browser, with swappable eyes and mouths for expressions.                              |
| Icons          | **lucide-react**                  | Added in the redesign.                                                                                                              |

### Browser APIs used (no libraries needed)

| API                                              | Used for                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `getUserMedia` + **MediaRecorder**       | Capturing the microphone into an audio file (WebM/Opus in Chrome).                          |
| **Web Audio API** (`AnalyserNode`)       | Measuring live loudness, about 60 times a second, to drive the audience.                    |
| **Web Speech API** (`SpeechRecognition`) | Live on-screen captions while you speak (speaker-facing only).                              |
| `localStorage` / `sessionStorage`            | Small preferences: skip the breathing warm-up, reel sound on or off, "just signed in" flag. |

---

## 3. Architecture

```
┌──────────────────────── Browser: React SPA (localhost:5173) ────────────────────────┐
│                                                                                      │
│  MediaRecorder ──────── records the mic into an audio blob (webm/opus)               │
│  Web Audio API ──────── live loudness ──► engagement ──► audience faces              │
│  Web Speech API ─────── live captions (shown to the speaker only)                    │
│                                                                                      │
│  api/client.ts ──────── fetch('/api/...') + session cookie + X-CSRFToken header      │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │  Vite dev proxy: /api ─► localhost:8000
                                       │  (same origin: no CORS, first-party cookies)
┌──────────────────────────────────────▼───────────── Django + Ninja (localhost:8000) ─┐
│  /api/auth/*  auth_api.py   register · login · logout · me · csrf                    │
│  /api/*       api.py        topics · sessions · audio · progress · level · scoring   │
│                                                                                      │
│  POST /api/sessions  (synchronous pipeline)                                          │
│    save audio ─► transcription.py ─► metrics.py ─► relevance.py ─► scoring.py        │
│               ─► feedback.py ─► save session ─► levels.py ─► update UserState        │
│                  (Whisper)       (pure)         (MiniLM)        (pure)               │
│                                                                                      │
│  config/scoring.yaml · config/fillers.yaml   ◄── every weight and threshold          │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       ▼
                     data/app.db (SQLite)   data/media/audio/*.webm
```

### The single most important distinction: two separate "brains"

|                        | **Live layer** (during the take)                           | **Scored layer** (after the take)                          |
| ---------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Where it runs          | In the browser                                                   | On the Django server                                             |
| What it looks at       | Only the **sound**: loudness, silence and how choppy it is | The **recording**, transcribed into words with timestamps  |
| What it produces       | Audience expressions, a mic meter, live captions                 | The score, the four components, the coaching notes and the level |
| Is it authoritative?   | No. It is encouragement and presence.                            | Yes. This is the result.                                         |
| Can it detect fillers? | **No**, and the UI never claims it does                    | Yes, from the transcript                                         |

If you remember one thing for questions: **the audience reacts to how you
sound, never to what you say; the score comes from the server afterwards.**

---

## 4. Repository map

```
Project/
├── backend/
│   ├── config/settings.py        Django settings: SQLite path, cookies, CSRF, CORS, Whisper size
│   ├── config/urls.py            Mounts /admin and /api; the API is private-by-default
│   ├── coach/
│   │   ├── models.py             Topic, Session, UserState (3 tables)
│   │   ├── schemas.py            API response shapes (become the /api/docs spec)
│   │   ├── api.py                Coach endpoints + the POST /sessions pipeline
│   │   ├── auth_api.py           Register, login, logout, me, csrf + throttling
│   │   ├── admin.py              Django admin views for inspecting data
│   │   ├── config/scoring.yaml   ★ every weight, threshold and level rule
│   │   ├── config/fillers.yaml   ★ the filler-word list
│   │   ├── data/topics.json      40 speaking prompts
│   │   ├── services/
│   │   │   ├── transcription.py  Whisper (I/O, lazy-loaded model)
│   │   │   ├── relevance.py      MiniLM similarity (I/O, lazy-loaded model)
│   │   │   ├── metrics.py        ★ PURE: words + timestamps → raw measurements
│   │   │   ├── scoring.py        ★ PURE: measurements → 0–100 scores
│   │   │   ├── feedback.py       ★ PURE: measurements + scores → coaching notes
│   │   │   ├── levels.py         ★ PURE: session history → level 0–7
│   │   │   └── config_loader.py  The only place YAML is read (cached)
│   │   └── management/commands/  seed_topics · seed_fake_sessions · claim_legacy_data
│   └── tests/                    125 tests (metrics, scoring, levels, api, auth, own topics)
│
├── frontend/
│   ├── vite.config.ts            Dev server + /api proxy to Django
│   ├── tailwind.config.js        Colours, fonts, design tokens
│   ├── src/main.tsx              All routes, lazy-loaded pages, AuthProvider
│   ├── src/App.tsx               Signed-in shell: header, nav, level chip, footer
│   ├── src/api/client.ts         Typed fetch wrapper: CSRF, retries, errors
│   ├── src/api/types.ts          TypeScript mirrors of schemas.py
│   ├── src/auth/                 AuthContext (who is signed in) + route guards
│   ├── src/hooks/
│   │   ├── useRecorder.ts        Microphone → audio blob
│   │   ├── useLiveAudio.ts       ★ Loudness → engagement signal
│   │   ├── useSpeechTranscription.ts  Live captions
│   │   └── useClipDeck.ts        Two-video playback for the welcome reel
│   ├── src/components/
│   │   ├── VirtualAudience.tsx   ★ The crowd and its realism rules
│   │   ├── AudienceFace.tsx      One DiceBear face with expressions and posture
│   │   ├── StageView.tsx         Full-screen dark stage while recording
│   │   ├── BreathingRitual.tsx   Optional warm-up before recording
│   │   ├── ScoreBreakdown.tsx    ★ The transparency centrepiece on Results
│   │   └── LevelLadder.tsx       The seven rungs
│   ├── src/pages/                Landing, Login, Register, Welcome, Practice,
│   │                             Results, Progress, HowItsScored
│   ├── src/lib/                  scoring.ts (labels and colours), levels.ts,
│   │                             audience.ts (room sizes), welcome.ts, validation.ts
│   ├── src/data/voices.ts        The welcome reel roster, quotes and craft notes
│   ├── public/voices/            Short self-hosted speech clips
│   └── tools/                    Playwright UI audit, fake-mic audio, clip builder
│
├── data/                         Runtime only (gitignored): app.db + media/audio/
├── README.md                     Setup and overview
└── IMPLEMENTATION_PLAN.md        The original phase-by-phase plan and resolved decisions
```

★ = the files most worth reading before you present.

---

## 5. One take, end to end

Follow this sequence when someone asks "walk me through what happens".

1. **Sign in.** The login form posts to `POST /api/auth/login` with a CSRF
   token. Django sets an HttpOnly session cookie. The form sets a
   "welcome pending" flag in `sessionStorage`, and the route guard
   (`PublicOnly` in [guards.tsx](frontend/src/auth/guards.tsx)) sends the
   user to `/welcome`.
2. **Welcome reel.** A short "Hall of Voices" reel plays (see
   [section 13](#13-the-welcome-reel-hall-of-voices)) and then hands over to
   the Practice page. It can be skipped with `Esc`.
3. **Practice page loads** ([PracticePage.tsx](frontend/src/pages/PracticePage.tsx)).
   It makes three calls: `GET /api/topics/random` for the prompt,
   `GET /api/level` to choose the default audience size, and
   `GET /api/scoring` for the minimum-length hint.
4. **Start practice.** The optional breathing warm-up runs first (two
   8-second breaths, then 3-2-1), unless the user chose "always skip"
   (`coach.skipRitual` in `localStorage`).
5. **Microphone opens.** `useRecorder.start()` asks for mic permission and
   starts `MediaRecorder`. The full-screen stage only appears **after** the
   mic is live. Otherwise a denied permission would show a running clock
   with nothing listening.
6. **While speaking.** Three things run in the browser at once:
   - `useLiveAudio` reads loudness about 60 times a second and produces an
     engagement value between 0 and 1. `VirtualAudience` turns that into face
     expressions.
   - `useSpeechTranscription` shows live captions.
   - A clock counts down to the one-minute minimum, then counts up; in the
     last minute before the ten-minute cap it counts down again and the
     recorder stops and submits on its own. STOP before one minute has to be
     pressed twice and discards the take: nothing under a minute is scored.
7. **Stop & analyse.** The recording (a `Blob`), the topic (`topic_id` for a
   random topic, or `topic_text` for the speaker's own) and the
   `duration_sec` measured in the browser are sent as a multipart form to
   `POST /api/sessions`. The UI shows "Analyzing your delivery…".
8. **Server pipeline** (`create_session` in [api.py](backend/coach/api.py)),
   all in one request:
   1. Validate the topic (exactly one of `topic_id` or 5–150 characters of
      `topic_text`) and that the duration is a positive, finite number
      of at most one hour.
   2. Create the `Session` row and save the audio file to `data/media/audio/`.
   3. Transcribe with Whisper to get words with start and end times.
   4. Compute metrics (pace, fillers, pauses, silence).
   5. Compute the topic similarity with MiniLM.
   6. Turn metrics into four 0–100 scores and an overall score.
   7. Write up to three coaching notes.
   8. Save everything on the session.
   9. Set the baseline if this is the account's first take, then re-evaluate
      the level. The level can only go up.
   10. Return `201 {"session_id": ...}`.
9. **Results page** (`/results/:id`). It fetches `GET /api/sessions/:id` and
   shows the score breakdown, an audio player (streamed from the
   ownership-checked `GET /api/sessions/:id/audio`), the coaching notes and
   the transcript, with a delete button.
10. **Progress page.** It fetches `/api/level`, `/api/progress` and
    `/api/sessions` and draws trend charts and the level ladder.

---

## 6. The analysis pipeline (the academic core)

### 6.1 Transcription ([transcription.py](backend/coach/services/transcription.py))

- **Model:** faster-whisper, size from the `WHISPER_MODEL_SIZE` environment
  variable (default `small`), running on CPU with `compute_type="int8"`.
  `int8` means the model's weights are stored as 8-bit integers instead of
  32-bit floats. That makes it faster and lighter on memory at a small cost in
  accuracy.
- **Settings:** `language="en"` (the project is English-only) and
  `word_timestamps=True`. Word timestamps are essential: pace and pauses are
  calculated from them.
- **Loaded once, lazily.** `@lru_cache(maxsize=1)` on `get_model()` means
  the model loads on the first request and then stays in memory. It is
  deliberately **not** loaded at Django start-up (`AppConfig.ready()`),
  because that would also run during `migrate`, seeding and tests, wasting
  30 seconds or more each time.
- **Output:** `{"transcript": "...", "words": [{"word", "start", "end"}, ...], "word_count": n}`.

### 6.2 Metrics ([metrics.py](backend/coach/services/metrics.py), pure)

| Metric                | Definition                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `speaking_time_sec` | last word's end − first word's start (silence before the first word and after the last is trimmed)                |
| `wpm`               | `word_count ÷ (speaking_time_sec ÷ 60)`                                                                        |
| gaps                  | between **consecutive** words only: `next.start − this.end`, negative values clamped to 0                 |
| `pause_count`       | gaps of **0.5 s or more**                                                                                    |
| `long_pause_count`  | gaps of **3.0 s or more**                                                                                    |
| `silence_ratio`     | sum of all gaps ÷ full recording length (`duration_sec`), capped at 1.0                                         |
| `filler_count`      | words matching the filler list after lower-casing and stripping punctuation, plus two-word phrases like "you know" |
| `filler_per_min`    | `filler_count ÷ (speaking_time_sec ÷ 60)`                                                                      |

Guards: zero words returns all zeros (no division by zero). A one-word take
has zero speaking time, so its wpm is 0.

**Worked example** (verified by running the real function). An 8-second
recording with six words:

| Word      | Start | End | Gap after                  |
| --------- | ----- | --- | -------------------------- |
| "So,"     | 0.0   | 0.4 | 0.1                        |
| "um"      | 0.5   | 0.8 | **0.6** (pause)      |
| "you"     | 1.4   | 1.6 | 0.0                        |
| "know"    | 1.6   | 1.9 | **3.1** (long pause) |
| "leaders" | 5.0   | 5.6 | 0.1                        |
| "listen." | 5.7   | 6.2 |                            |

- speaking time = 6.2 − 0.0 = **6.2 s**, so wpm = 6 ÷ (6.2/60) = **58.1**
- pauses = 2 (0.6 and 3.1), long pauses = **1** (3.1)
- silence ratio = (0.1+0.6+0.0+3.1+0.1) ÷ 8.0 = **0.4875**
- fillers = "so" + "um" + "you know" = **3**, which is **29.0 per minute**

### 6.3 Relevance ([relevance.py](backend/coach/services/relevance.py))

- An **embedding** is a list of numbers (384 for MiniLM) that represents the
  meaning of a text. Texts about similar things get vectors pointing in
  similar directions.
- The transcript and the topic prompt are both embedded and **L2-normalised**
  (scaled to length 1). Their dot product is then the **cosine similarity**,
  between −1 and 1.
- The **raw cosine is always stored** in `relevance_similarity`. That means
  the score mapping can be re-tuned later without re-recording anything.
- Real values from the model, for the topic *"What makes a good leader?"*:
  | Text                                                                                     | Cosine | Relevance score |
  | ---------------------------------------------------------------------------------------- | ------ | --------------- |
  | "A good leader listens to their team, sets a clear direction and takes responsibility…" | 0.778  | 100             |
  | "My favourite food is pilau with kachumbari, especially at weekends…"                   | 0.141  | 0               |
  | Empty transcript (silence)                                                               | 0.08   | 0               |

### 6.4 Scoring ([scoring.py](backend/coach/services/scoring.py), pure)

All constants come from [scoring.yaml](backend/coach/config/scoring.yaml).

| Component           | Rule                                                                                                                                                                                                                                  | Weight         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Pace**      | 100 inside **120–150 wpm**. Outside the band, lose **1.5 points per wpm** of distance (minimum 0).                                                                                                                       | **25 %** |
| **Fillers**   | 100 at or below **1 per minute**, 0 at or above **8 per minute**, a straight line between.                                                                                                                                | **25 %** |
| **Pauses**    | Start at 100. Subtract **15 per long pause**. Subtract `(silence_ratio − 0.35) × 100` if silence is over 35 %. Subtract **10** if there were **no pauses at all** (a "wall of speech"). Keep between 0 and 100. | **15 %** |
| **Relevance** | Cosine **0.15 or less → 0**, **0.55 or more → 100**, a straight line between.                                                                                                                                           | **35 %** |
| **Overall**   | Weighted sum of the four, rounded to 1 decimal place.                                                                                                                                                                                 |                |

Relevance has the highest weight because staying on topic under impromptu
pressure is the skill this project focuses on.

**Worked example** (verified). A one-minute take at 165 wpm, 4 fillers a
minute, 5 pauses of which 1 was long, 20 % silence, cosine 0.35:

| Component         | Calculation                                         | Score | × Weight | Points         |
| ----------------- | --------------------------------------------------- | ----- | --------- | -------------- |
| Pace              | 100 − 1.5 × (165 − 150)                          | 77.5  | 0.25      | 19.4           |
| Fillers           | 100 × (8 − 4) ÷ (8 − 1)                         | 57.1  | 0.25      | 14.3           |
| Pauses            | 100 − 15 × 1 (silence under 35 %, pauses present) | 85.0  | 0.15      | 12.75          |
| Relevance         | 100 × (0.35 − 0.15) ÷ (0.55 − 0.15)             | 50.0  | 0.35      | 17.5           |
| **Overall** |                                                     |       |           | **63.9** |

The Results screen shows exactly this breakdown, so a user can explain their
own score from that one screen ([ScoreBreakdown.tsx](frontend/src/components/ScoreBreakdown.tsx)).

### 6.5 Feedback ([feedback.py](backend/coach/services/feedback.py), pure)

| Rule (thresholds from `feedback:` in the YAML) | Note written                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| wpm **over** 150                           | "You spoke quite fast (165 wpm). Aim for 120–150 — try pausing at full stops."      |
| 0 < wpm **under** 120                      | "Your pace was a little slow (…). A touch more energy…"                             |
| fillers **over** 3 per minute              | "You used fillers about 4× a minute. A short silent pause is stronger than an 'um'." |
| long pauses **over** 2                     | "You had N pauses over 3 seconds…"                                                   |
| relevance score **under** 60               | "Your speech drifted from the topic. Name its key terms early…"                      |
| no rule fired                                    | Specific praise naming your strongest component                                       |
| no words heard                                   | "We couldn't hear clear speech. Check your mic…"                                     |

Notes are **ranked by how many points that component lost** (100 − score),
and at most **3** are shown. In the worked example above, three rules fire,
and they appear in this order: relevance (lost 50), fillers (lost 42.9),
pace (lost 22.5).

The comparisons are strict: exactly 3 fillers a minute does **not** trigger
the filler note.

### 6.6 When things go wrong

- If transcription throws (for example, an undecodable file), the error is
  logged and the take is treated as an empty transcript. If the embedding
  throws, similarity is 0. **The request never returns a 500 error.** The
  session is still saved and the feedback says it couldn't hear speech.
- **A completely silent take scores 38.5**, not 0 (verified). Pace is 0
  (0 wpm), fillers are 100 (none found), pauses are 90 (only the "no pauses"
  penalty), and relevance is 0. Know this number. It is a fair question, and
  see [section 18](#18-limitations-and-known-weak-spots) for the fix.

---

## 7. Levels and progression ([levels.py](backend/coach/services/levels.py), pure)

| Level | Name              | Award               | Unlock rule (from `levels:` in the YAML)                                                             |
| ----- | ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| 0     | Getting Started   |                     | starting state                                                                                         |
| 1     | The Novice        | First Voice         | any take of **60 s or more**                                                                     |
| 2     | The Apprentice    | Finding Your Voice  | **3+ takes** and the **latest** overall is **at least 5 points above your baseline** |
| 3     | The Speaker       | Steady Pace         | **3 of your last 5** takes with pace in 120–150 wpm                                             |
| 4     | The Communicator  | Clear Voice         | **3 of your last 5** with fewer than 3 fillers a minute                                          |
| 5     | The Persuader     | On Point            | **3 of your last 5** with relevance score of 80 or more                                          |
| 6     | The Orator        | Commanding Presence | **2 takes ever** with overall 80+ **and** every component 70+                              |
| 7     | The Master Orator | Master Orator       | **4 of your last 5** with overall 85+                                                            |

Key behaviours:

- **Baseline** = the overall score of the account's **very first
  random-topic take**, captured once and never overwritten.
- **Own topics count for delivery levels only.** Takes on a topic the speaker
  typed count towards the **delivery levels** (1 The Novice, 3 The Speaker, 4 The Communicator), which only look at duration, pace and fillers. They never count towards Levels 2, 5, 6 or 7, which depend on relevance directly or through the overall score, and they never set the baseline. Relevance is 35% of the score, and a
  self-written prompt could echo the planned speech.
  - How: `_leveling_sessions` in `api.py` returns two pools (random takes,
    all takes). `levels.evaluate(sessions, baseline, cfg, delivery_sessions=...)`
    judges `DELIVERY_LEVELS = {1, 3, 4}` on the wider pool and everything else
    on random takes. `levels.py` stays pure and never learns topic sources.
  - Proof: four excellent own-topic takes (overall about 94) stop at
    **exactly Level 4**; the same takes on random topics reach **Level 7**
    (`test_custom_topic.py`).
- **Monotonic:** after every take, `current_level = max(current_level, evaluate(...))`.
  A bad week never takes a level away. That is a deliberate motivation choice.
- `evaluate` returns the **highest** level whose rule holds right now. Lower
  rules do not all have to hold at the same time, so it is possible to jump
  levels.
- Levels 3, 4, 5 and 7 look at a **window of the last 5 takes**. Level 6
  counts across **all** takes.
- `progress_to_next` returns a 0–1 fraction plus a human sentence such as
  "2 of 3 recent sessions with pace in range". That is what the progress bar
  on the ladder shows.

---

## 8. The live layer in the browser

### 8.1 Recording ([useRecorder.ts](frontend/src/hooks/useRecorder.ts))

- `getUserMedia({audio: true})` gives a `MediaStream`. `MediaRecorder` records
  it, preferring `audio/webm;codecs=opus`, and collects chunks every 250 ms.
- The recording's real format (`recorder.mimeType`) is used to name the upload
  (`take.webm`, `take.ogg`, `take.mp4`), and the server serves it back with
  the matching content type. A wrong label made playback fail silently on
  some browsers, which is why this exists.
- The same `MediaStream` is shared with the live-audio hook.
- If the recorder fails after the mic opened, the mic tracks are stopped so
  the browser's red recording indicator doesn't stay lit.

### 8.2 Engagement signal ([useLiveAudio.ts](frontend/src/hooks/useLiveAudio.ts))

Every animation frame (about 60 times a second):

1. Read the waveform from an `AnalyserNode` and compute **RMS** (root mean
   square, a measure of loudness).
2. **Speaking** = RMS above 0.04.
3. Count **onsets** (silence-to-speech transitions) in the last 3 seconds as
   a rough "choppiness" proxy.
4. Choose a **target engagement**:
   | Situation                                         | Target |
   | ------------------------------------------------- | ------ |
   | Speaking at a comfortable volume (RMS 0.06–0.40) | 0.92   |
   | Speaking very loudly (shouting)                   | 0.72   |
   | Speaking but quiet                                | 0.55   |
   | …and very choppy (more than 5.5 onsets a second) | −0.10 |
   | Silent for under 2 s                              | 0.66   |
   | Silent for 2–4 s                                 | 0.40   |
   | Silent for more than 4 s                          | 0.18   |
5. Glide towards the target with an **exponential moving average (EMA)**:
   `engagement += (target − engagement) × (1 − e^(−dt/τ))`, with τ ≈ 1.2 s.
   This is why faces drift rather than flicker.
6. Publish the value to React about 11 times a second (every 90 ms) to avoid
   pointless re-renders.

### 8.3 The crowd ([VirtualAudience.tsx](frontend/src/components/VirtualAudience.tsx), [AudienceFace.tsx](frontend/src/components/AudienceFace.tsx))

Each face's expression comes from `engagement + its own bias`:

| Engagement   | Face                                        |
| ------------ | ------------------------------------------- |
| 0.82 or more | nodding (happy eyes, big smile, leans in)   |
| 0.70 or more | attentive (smile)                           |
| 0.45 or more | neutral                                     |
| 0.30 or more | bored (eyes closed, frown, slumps)          |
| below 0.30   | distracted (eyes closed, turns away, fades) |

**Realism rules**, which are the reason it doesn't look robotic:

- Each seat has a **personal bias** between −0.12 and +0.12, so some people
  are always a little keener than others.
- Each seat has a **reaction delay** of 300–1200 ms. A new mood has to persist
  that long before the face changes.
- **No face changes more than once every 2 seconds.**
- Seat traits are computed from the seat number, not `Math.random`, so the
  crowd is stable between renders.
- Faces blink and sway out of phase with each other (golden-ratio spacing).

### 8.4 Room size and difficulty ([audience.ts](frontend/src/lib/audience.ts))

| Your level | Default room          | "Forgiveness"   |
| ---------- | --------------------- | --------------- |
| 0–2       | 3 faces               | 1.3 (forgiving) |
| 3–4       | 6 faces               | 1.1             |
| 5–6       | 9 faces               | 1.0 (normal)    |
| 7          | 12 faces (full house) | 0.85 (tough)    |

The user can override the size, including an **empty room** (0). Forgiveness
follows the visible size. In a tough room, low targets are pulled down further
(multiplied by 0.85), so the crowd sours more quickly. The idea is **graduated
exposure**: bigger and tougher rooms unlock as you improve.

### 8.5 Live captions ([useSpeechTranscription.ts](frontend/src/hooks/useSpeechTranscription.ts))

- Uses the browser's built-in Web Speech API. It is restarted automatically
  when Chrome stops it after a pause.
- **Speaker-facing only and not authoritative.** The score always comes from
  Whisper on the server.
- Not available in Firefox; the captions panel then shows a softer message.
- **Privacy caveat:** in Chrome and Edge this API sends audio to the browser
  vendor's speech service. See [section 18](#18-limitations-and-known-weak-spots).

### 8.6 Breathing ritual ([BreathingRitual.tsx](frontend/src/components/BreathingRitual.tsx))

Two slow breaths (4 s in, 4 s out), then 3-2-1, then recording starts.
"Skip" is always visible, and "always skip" is remembered. It is framed as
gentle preparation for **confidence**; the project deliberately makes **no
claim to treat anxiety**.

---

## 9. Data model ([models.py](backend/coach/models.py))

Three tables, plus Django's built-in `User`.

```
User (django.contrib.auth)
 │ 1
 ├──────────────< Session (many)          Topic (40 seeded)
 │                 user (FK, nullable)  ──> topic (FK, PROTECT, nullable)
 │                 topic_source ("random" | "custom")
 │                 topic_text (snapshot; the only topic a custom take has)
 │                 audio (file path), duration_sec
 │                 transcript, word_count, words_json [{word,start,end}]
 │                 wpm, filler_count, filler_per_min, pause_count,
 │                 long_pause_count, silence_ratio, relevance_similarity
 │                 pace/filler/pause/relevance/overall _score (0–100)
 │                 feedback_json [str]
 │ 1
 └──────────────1 UserState
                   current_level (only ever increases)
                   baseline_overall (first take's score, set once)
```

Design points worth mentioning:

- **`topic_text` is copied onto the session.** If a topic is reworded later,
  old results still show what was actually asked.
- **`topic` is nullable** because an own-topic take answers a prompt the
  speaker typed, which has no `Topic` row. `topic_source` records which kind
  of take it was (migration `0003`; existing sessions became `random`).
- **`on_delete=PROTECT` on topic:** a topic that has been used can't be
  deleted out from under its sessions.
- **Raw measurements and scores are both stored.** You can recalibrate the
  scoring and recompute from the stored measurements.
- **`user` is nullable** to support data recorded before accounts existed
  (the "legacy bucket"). `claim_legacy_data --email you@x.com` assigns it to
  an account.
- Score columns are nullable because the row exists for a moment before
  analysis fills them in.

---

## 10. API reference

Interactive docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs) (generated from the code).
Every endpoint requires sign-in unless marked public.

| Method | Path                                    | What it does                                                                                                |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auth/csrf`                      | **Public.** Sets the CSRF cookie.                                                                     |
| POST   | `/api/auth/register`                  | **Public.** Creates an account and signs in.                                                          |
| POST   | `/api/auth/login`                     | **Public.** Signs in (`remember` controls cookie lifetime).                                         |
| POST   | `/api/auth/logout`                    | Signs out.                                                                                                  |
| GET    | `/api/auth/me`                        | The current user, including `session_count` and `is_new`.                                               |
| GET    | `/api/topics/random?category=general` | A random prompt.                                                                                            |
| POST   | `/api/sessions`                       | Multipart: `audio`, `duration_sec`, and **either** `topic_id` **or** `topic_text` (own topic, 5–150 chars). Runs the whole pipeline and returns `{session_id}`. |
| GET    | `/api/sessions/{id}`                  | Full breakdown: metrics, scores, weights, feedback, words, transcript.                                      |
| GET    | `/api/sessions/{id}/audio`            | Streams the recording, to its owner only.                                                                   |
| GET    | `/api/sessions?limit=&offset=`        | Your takes, newest first (limit capped at 100).                                                             |
| DELETE | `/api/sessions/{id}`                  | Deletes a take.                                                                                             |
| GET    | `/api/progress`                       | Every take's scores, oldest first, for charts, plus the baseline.                                           |
| GET    | `/api/level`                          | Current level, next level, progress fraction and text, unlocked badges.                                     |
| GET    | `/api/scoring`                        | Live weights from the YAML, used by "How it's scored".                                                      |

---

## 11. Accounts and security

| Threat                                                  | Defence                                                                                                                                                                                                                                                                                        | Where                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A forgotten `@login_required` leaves an endpoint open | The API is built with `auth=django_auth`, so **every endpoint is private by default** and public ones must opt out explicitly.                                                                                                                                                         | [urls.py](backend/config/urls.py)                                                |
| One account reading another's recordings                | All session queries go through one helper, `_sessions_of(request)`, which filters by `user=request.user`. Tests prove cross-account access fails.                                                                                                                                          | [api.py](backend/coach/api.py)                                                   |
| Confirming that someone else's session id exists        | Another account's session returns **404, not 403**. A 403 would reveal that it exists.                                                                                                                                                                                                   | `get_session`                                                                 |
| Guessable public audio URLs                             | `MEDIA_ROOT` is **not** served publicly. Audio is only streamed through the ownership-checked `/audio` endpoint.                                                                                                                                                                     | `urls.py`, `get_session_audio`                                              |
| Stealing the login token with XSS                       | **Session cookie, HttpOnly**: JavaScript can't read it, and there is no token in `localStorage`.                                                                                                                                                                                       | [settings.py](backend/config/settings.py)                                        |
| Cross-site request forgery (CSRF)                       | **Double-submit token**: the SPA copies the `csrftoken` cookie into an `X-CSRFToken` header on every unsafe request. Login and register check it explicitly, which prevents **login CSRF** (an attacker silently signing you into *their* account to collect your practice). | [auth_api.py](backend/coach/auth_api.py), [client.ts](frontend/src/api/client.ts) |
| Password guessing                                       | **Throttle:** 8 failures per IP + email within 15 minutes returns 429. A success clears the counter. Uses `REMOTE_ADDR`, never the spoofable `X-Forwarded-For`.                                                                                                                      | `auth_api.py`                                                                 |
| Finding out which emails have accounts                  | The **same error message** for "no such account" and "wrong password".                                                                                                                                                                                                                   | `sign_in`                                                                     |
| Weak passwords                                          | Django's validators: at least 8 characters, not common, not all numbers, not similar to the name or email. The form mirrors them live in [validation.ts](frontend/src/lib/validation.ts), but the server is the authority.                                                                      | `settings.py`                                                                 |
| Lying about recording length                            | `duration_sec` must be finite, positive and at most 1 hour; `silence_ratio` is capped at 1.                                                                                                                                                                                                | `create_session`, `metrics.py`                                              |

Session lifetime: "Remember me" gives a 30-day cookie that slides forward
with activity. Without it, the cookie dies when the browser closes.

---

## 12. Frontend architecture

- **Routing** ([main.tsx](frontend/src/main.tsx)): `/login`, `/register`,
  `/welcome`, and inside the app shell `/`, `/results/:id`, `/progress` and
  `/how-its-scored`. Unknown paths redirect to `/`.
- **Code splitting:** Results, Progress, How-it's-scored and Welcome are
  loaded with `React.lazy` because they pull in Recharts or video. The landing
  and sign-in pages load immediately, since they are what a visitor sees first.
- **Route guards** ([guards.tsx](frontend/src/auth/guards.tsx)):
  - `RequireAuth`: signed-out visitors go to `/login`, except at `/`, where
    they see the public **landing page**. The guard remembers where you were
    going.
  - `PublicOnly`: signed-in users are bounced out of login and register, to
    `/welcome` if the welcome flag is set.
  - Both show a branded splash while the session check is in flight, so a
    refresh never flashes the login page.
- **AuthContext** ([AuthContext.tsx](frontend/src/auth/AuthContext.tsx)): a
  **cache** of the server's answer to `GET /auth/me`, never the source of
  truth (the cookie is). A `useRef` guard makes sure React StrictMode's double
  effect runs only one boot request.
- **API client** ([client.ts](frontend/src/api/client.ts)):
  - Adds the CSRF header to POST, PUT, PATCH and DELETE.
  - On a **403** for an unsafe request, it refreshes the CSRF token and
    **retries once**. This covers a tab left open overnight.
  - On a **401** from a non-auth endpoint, it tells AuthContext the session
    expired, so the app drops to signed-out instead of failing quietly.
  - Wraps failures in `ApiError(status, message)` using the server's `detail`.
- **Types** ([types.ts](frontend/src/api/types.ts)) mirror
  [schemas.py](backend/coach/schemas.py) by hand.
- **Design system** ([tailwind.config.js](frontend/tailwind.config.js)): one
  brand colour (violet `#7a50ff`), coral reserved for record, stop and delete,
  and four fixed component colours shared by score bars and charts (pace cyan,
  fillers amber, pauses pink, relevance green). Fonts are Fraunces (serif
  headlines) and Inter (interface).

---

## 13. The welcome reel (Hall of Voices)

After sign-in, a short reel shows six speakers (King, Obama, Mandela, Maathai,
Yousafzai, Churchill). Each slide has one quote and a **craft note** linking
what the speaker did to something Cadence measures, such as pace, pauses or
staying on topic. So the intro teaches as well as inspires.

Technically interesting points:

- **The clip is the clock.** Each slide's progress bar, its word-by-word text
  reveal and the move to the next slide are all driven by the audio clip's
  playhead. Pause the clip and everything pauses, so the words on screen can't
  drift away from the voice.
- **Word timings are generated, not hand-made.**
  [tools/build_voices.py](frontend/tools/build_voices.py) downloads each
  source recording, transcribes it with Whisper to find exactly where the
  quote is spoken, trims and loudness-matches a clip, and writes the per-word
  times to [voiceClips.json](frontend/src/data/voiceClips.json). It is the same
  word-timestamp technique the main app uses, applied to another problem.
- **Two `<video>` "decks"** ([useClipDeck.ts](frontend/src/hooks/useClipDeck.ts)):
  while one plays, the next is already buffered, so cuts are instant. Both
  exist from the first tap, which satisfies Safari's rule that each media
  element needs a user gesture to play with sound.
- **Graceful fallback:** a missing clip, a slow start (4 s timeout) or
  `prefers-reduced-motion` all fall back to a timed, typography-only slide.
- **Copyright caveat:** these are real speeches, and most recordings are
  under copyright. The README in `public/voices/` says to clear them, swap
  them, or set `USE_ARCHIVE_FOOTAGE = false` before publishing anywhere
  public. A short attributed quotation as text is much safer than hosting
  audio or video.

---

## 14. Testing

Run it with `cd backend` then `.venv\Scripts\pytest`. **125 tests pass**
(about 90 s on this machine; most of that is Django setup and password hashing).

| File                                            | Functions | What it proves                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [test_metrics.py](backend/tests/test_metrics.py) | 9         | wpm, pause thresholds (inclusive at exactly 0.5 s and 3.0 s), silence ratio, single and multi-word fillers, empty input                                                                                                                |
| [test_scoring.py](backend/tests/test_scoring.py) | 8         | every boundary (120/150 wpm, 1/8 fillers a minute, 0.15/0.55 cosine), clamping to 0–100, the weighted overall                                                                                                                         |
| [test_levels.py](backend/tests/test_levels.py)   | 17        | each level's rule, "3 of last 5" windowing, baseline, the 4-way Level 6 condition, **monotonicity**, the delivery pool only reaching Levels 1, 3 and 4                                                                                                                              |
| [test_api.py](backend/tests/test_api.py)         | 16        | the pipeline persists the right fields; response shapes; **every endpoint refuses anonymous callers**; **one account cannot see, stream or delete another's sessions**; impossible durations rejected; audio content types |
| [test_custom_topic.py](backend/tests/test_custom_topic.py) | 13 | own topics: scored against the typed text (trimmed), both/neither rejected, 5–150 character bounds, **reach the delivery levels but stop at Level 4** while identical random takes reach 7, never set the baseline, still in history and progress, private to the account |
| [test_auth.py](backend/tests/test_auth.py)       | 18        | register and login, email case-insensitivity, duplicate emails, password policy, throttling, no account enumeration, CSRF required on public endpoints                                                                                 |

Many functions are parametrised (run with several inputs), which is how 81
functions become 125 tests.

**Testing strategy, in one breath:** the pure core is tested against
**hand-computed expected values**, never against live Whisper output, which
would be slow and non-deterministic. The API tests **mock** transcription and
similarity, so no model loads and the tests are fast and repeatable.

---

## 15. Configuration

| What                                                      | Where                                                                                                                                         | Effect                                                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Weights, bands, penalties, feedback triggers, level rules | [scoring.yaml](backend/coach/config/scoring.yaml)                                                                                              | Restart the backend to apply (the config is cached).                                                                                                                  |
| Filler words                                              | [fillers.yaml](backend/coach/config/fillers.yaml)                                                                                              | 15 single words (um, uh, er, erm, ah, hmm, like, so, actually, basically, literally, honestly, right, well, okay) and 4 phrases (you know, I mean, sort of, kind of). |
| Whisper size                                              | env `WHISPER_MODEL_SIZE`                                                                                                                    | `tiny`, `base`, `small` (default), `medium` or `large`. Bigger is more accurate and slower.                                                                 |
| Production settings                                       | env `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DB_PATH`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` | Defaults are for local development only.                                                                                                                              |

---

## 16. Running it, and a demo script

### Start-up (two terminals)

```powershell
# Terminal 1 — backend on :8000
cd backend
.venv\Scripts\activate
python manage.py migrate
python manage.py seed_topics                  # once: 40 prompts
python manage.py runserver

# Terminal 2 — frontend on :5173
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

To get a populated Progress page without recording a dozen takes:

```powershell
python manage.py seed_fake_sessions --reset --count 12 --email you@example.com
```

That creates 12 synthetic sessions with an improving trend. The scores are
calculated by the **real** scoring code, so they are internally consistent.
Register the account in the app first.

### Before you present

- **Warm the models up.** The first take after starting the backend
  downloads or loads Whisper and MiniLM and can take tens of seconds.
  Record one throwaway take before the audience arrives; after that, analysis
  takes a few seconds.
- **Use Chrome.** It has the best support for MediaRecorder, the speech API
  and the reel's video format.
- **Use a quiet room and a decent mic.** The audience reacts to loudness, so
  background noise counts as "speaking".
- Have **two accounts** ready: a fresh one to show a first take, and a seeded
  one to show Progress and a higher level.
- The machine has 8 GB of RAM. Close heavy apps; don't run the Playwright
  audit during the demo.
- If you want to skip the breathing warm-up during the demo, tick "always
  skip" once, or set `coach.skipRitual` to `1` in `localStorage`.

### Suggested demo order (about 8 minutes)

1. **Landing page** (signed out, at `/`): the pitch in seven sections.
2. **Sign in.** The welcome reel plays. Let one slide run, point out the
   words lighting in time with the voice, then press `Esc`.
3. **Practice:** show the topic, the room size selector and the "what we'll
   measure" chips. Flip the **Random | My own** switch to show that a speaker
   can type their own topic, and explain that those takes count only for the delivery levels. Press Start, show the breathing warm-up briefly, then speak
   for a little over a minute. **Pause deliberately for 4–5 seconds** mid-speech so
   the audience visibly loses interest, then pick up again so they recover.
4. **Results:** walk through **one component end to end**, from raw number to
   score to weight to points. Show the coaching notes, play the recording and
   open the transcript.
5. **"How it's scored"** (linked from Results): the weights are read live
   from the server config.
6. **Progress** (seeded account): the trend chart, the baseline comparison
   and the level ladder with its progress-to-next text.
7. **Under the hood** (if time allows): `/api/docs`, the YAML file, a run of
   `pytest`, and the Django admin at `/admin` (create a login first with
   `python manage.py createsuperuser`).

---

## 17. Design decisions you should be able to defend

| Decision                                            | Alternative rejected                              | Why                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rule-based scoring**                        | Train an ML model to predict a "speaking score"   | No labelled dataset; a black box can't explain itself; users can't improve on what they don't understand. Rules are explainable, testable and tunable.       |
| **ML only for measurement** (Whisper, MiniLM) | Hand-built speech recognition or keyword matching | Transcription and meaning-comparison are solved problems with good open models. Keyword matching would miss paraphrases.                                     |
| **Synchronous analysis** inside the request   | A task queue (Celery + Redis)                     | Single-user local tool; a 10–30 s request harms nobody and the UI shows an honest loading state. A queue adds two more services to run.                     |
| **SQLite**                                    | PostgreSQL                                        | No server to install; one file; plenty for one machine.                                                                                                      |
| **Session cookies**                           | JWT in `localStorage`                           | An HttpOnly cookie can't be stolen by XSS; Django provides sessions, CSRF and logout for free. Same origin through the Vite proxy makes cookies simple.      |
| **Own topics count for delivery levels only** | Count them fully, exclude them from all levels, or ban own topics | Speakers wanted to talk about their own subjects and still progress. Relevance (35%) is measured against the topic text, so a self-written prompt could echo the speech. Levels 1, 3 and 4 read only duration, pace and fillers, which the topic can't influence, so own topics count there; the relevance-based Levels 2, 5, 6 and 7 stay random-topic only. |
| **Monotonic levels**                          | Levels that rise and fall                         | Losing a badge after one bad day punishes practice. The trend chart already shows honest ups and downs.                                                      |
| **Store raw measurements as well as scores**  | Store only scores                                 | Thresholds are uncalibrated starting points; raw values let you re-score history later.                                                                      |
| **Lazy, cached models**                       | Load at start-up                                  | Start-up would cost 30 s or more for every `migrate`, seed and test run.                                                                                   |
| **Audience reacts to sound only**             | React to words                                    | Live word-level analysis would need a model in the loop, and live filler detection isn't reliable. Delivery and presence is what the room should respond to. |
| **Pure core modules**                         | Logic inside Django views                         | Testable without a database or server; the academic part of the project is provable on its own.                                                              |
| **Django Ninja**                              | Django REST Framework                             | Less boilerplate; type hints give validation and OpenAPI docs automatically.                                                                                 |
| **Local and CPU-only**                        | Cloud speech APIs                                 | Privacy, no cost, works offline, no API keys.                                                                                                                |

---

## 18. Limitations and known weak spots

Being upfront about these is stronger than being caught by them.

**About the measurements**

1. **The thresholds are not validated.** 120–150 wpm, the filler limits and
   the 0.15/0.55 relevance bounds are reasonable starting values, not
   calibrated against human judges. The YAML and README say so. The fix is a
   small study: have people rate recordings, then tune the YAML to match. Raw
   values are stored to make that possible.
2. **Whisper tends to tidy up speech.** Whisper was trained to produce
   readable transcripts and is widely reported to **leave out "um" and "uh"**.
   So hesitation fillers can be **under-counted**, while legitimate uses of
   "like", "so" or "well" are **over-counted**. That is a transcription
   limitation the config cannot fully fix.
3. **Relevance measures topical closeness, not argument quality.** A
   rambling speech full of topic words can score well. Very long speeches are
   also cut off: MiniLM only reads roughly the first 256 word-pieces (about
   200 words), so for long takes only the opening counts.
4. **A silent take scores 38.5, not 0.** Fillers (100) and pauses (90) are
   rewarded for an absence of speech. The feedback does say no speech was
   heard. Fix: when `word_count == 0`, set every score to 0. Note that a
   silent first take also becomes your baseline.
5. **`duration_sec` comes from the browser.** It is validated (positive,
   at most 1 hour) and the silence ratio is capped, but it is still
   client-supplied, and it gates Level 1. Fix: use the duration that Whisper
   already returns (`info.duration`, currently ignored in `transcribe`).
6. **English only, voice only.** No pitch, intonation, body language or
   eye contact. Those were explicitly out of scope.

**About privacy**

7. **Live captions leave the machine in Chrome and Edge.** The Web Speech API
   sends audio to the browser vendor's service. That sits awkwardly with
   "data never leaves the install". The stored transcript and the score
   are all local (Whisper). Mitigation: a toggle to turn captions off, or
   say clearly that captions use the browser's online service.
8. ~~**Deleting a take leaves its audio file on disk.**~~ Fixed:
   `delete_session` now calls `session.audio.delete(save=False)` first.

**About the code**

9. ~~**`/api/scoring` always returns `min_session_sec = 45`.**~~ Fixed: the
   take-length bounds now live in one `session:` block in `scoring.yaml`
   (`min_graded_sec: 60`, `max_sec: 600`) and the endpoint reads them from
   there. The server also refuses takes under the minimum, checking both the
   browser's `duration_sec` and the decoded length of the audio itself.
10. **Some facts are written in two places.** Level names (`levels.py` and
    `lib/levels.ts`), the landing page's unlock descriptions and the pace
    band in `lib/scoring.ts` all mirror the backend by hand. Change the YAML
    and those texts can drift.
11. **A code comment overstates how tough rooms work.** It says tough rooms
    "decay faster", but the code gives them a *longer* smoothing time (τ =
    1.2 ÷ 0.85 ≈ 1.4 s). What actually makes them tougher is that low targets
    are pulled lower. Describe it that way if asked.
12. **Not production-ready as configured.** `DEBUG` defaults to on, there is
    a default secret key, the throttle uses per-process memory, and analysis
    blocks a server worker. All are fine for a local tool and are controlled
    through environment variables, but say "local-first" rather than
    "deployable as is".

---

## 19. Likely questions, with answers

**Q: Why not just use AI to score the speech?**
A: Because the user needs to know *why* they got a score in order to improve.
There's no labelled dataset to train on, and a model's output can't be
explained or tested exactly. I use AI only to *measure*: Whisper for words
and timings, MiniLM for meaning. The judging is done by rules anyone can read
in one YAML file.

**Q: How accurate is the scoring?**
A: The code is provably correct against its definitions; 125 tests use
hand-computed values. Whether the *definitions* match human judgement isn't
validated yet. The thresholds are starting values, and I store the raw
measurements so they can be calibrated against human ratings without
re-recording anything.

**Q: Can't someone game relevance by writing their own topic?**
A: They could raise that take's relevance score, so own-topic takes only
count towards the levels that ignore relevance: Level 1 (duration), Level 3
(pace) and Level 4 (fillers). Levels 2, 5, 6 and 7 depend on relevance and
move only on randomly drawn topics, and the baseline comes from a random take.
`test_custom_topic.py` proves it: four excellent own-topic takes stop at
exactly Level 4, while the same takes on random topics reach Level 7.

**Q: How does relevance work?**
A: Both the transcript and the topic become 384-number vectors that represent
their meaning. The cosine of the angle between them measures how similar they
are. For "What makes a good leader?", an on-topic answer scores about 0.78 and
an answer about food about 0.14. Anything at or below 0.15 maps to 0, at or
above 0.55 maps to 100, with a straight line between.

**Q: Can it be gamed?**
A: Partly. Repeating topic words raises relevance, and speaking in a steady
stream at 135 wpm with brief pauses scores well on delivery. It measures
delivery habits and staying on topic, not the quality of your argument.

**Q: Does the audience understand what I'm saying?**
A: No, by design. It reacts only to loudness, silence and choppiness, in the
browser. That keeps it real-time and private, and it never pretends to
detect fillers live.

**Q: How do you stop the audience looking fake?**
A: Smoothing (an exponential moving average over about 1.2 s), a personal
bias per face, a 0.3–1.2 s reaction delay per face, and a rule that no face
changes more than once every 2 seconds. Faces also blink and sway out of
phase with each other.

**Q: Is the data private?**
A: Recordings, transcripts and scores stay on the machine, and each account
sees only its own; there are tests for that. The one exception to be upfront
about is that live captions in Chrome use the browser's online speech service.

**Q: Why is analysis synchronous? Won't it block?**
A: It does block that one request, for 10–30 seconds on the first take and a
few seconds after that. For a single-user local tool that's acceptable, and
the UI shows a real loading state. With many users I would add a task queue
and poll for the result.

**Q: How does it handle multiple users?**
A: Each account's sessions and level are isolated. Every query is filtered
by the signed-in user, another user's session id returns 404, and audio is
streamed only to its owner. The API tests check all three.

**Q: Why session cookies instead of JWT?**
A: An HttpOnly cookie can't be read by JavaScript, so an XSS bug can't steal
it. Django gives sessions, logout and CSRF protection out of the box, and the
Vite proxy puts the frontend and API on the same origin.

**Q: What's CSRF and how do you prevent it?**
A: CSRF is another site making your browser send a request with your cookies.
The SPA reads the `csrftoken` cookie and sends it back in a header; another
site can't read that cookie, so it can't forge the header. Login is protected
too, which prevents an attacker from signing you into *their* account.

**Q: Why can't levels go down?**
A: Losing a rank after one bad take punishes practice. The trend chart still
shows honest ups and downs; the level records your best demonstrated skill.

**Q: What happens if you record silence?**
A: It scores 38.5 and the note says no speech was heard. That's a known flaw
(fillers and pauses get credit for nothing). The fix is to zero all scores
when no words are found.

**Q: Why Whisper `small` and not `large`?**
A: Speed on a CPU-only laptop. It's one environment variable to change; `medium`
is more accurate and slower.

**Q: Why these four components and weights?**
A: They are measurable from audio and timestamps alone, and each maps to
advice a speaker can act on. Relevance carries 35 % because staying on topic
is the core impromptu skill. All the weights are in the YAML and shown on the
results screen.

**Q: Is this a therapy tool for speaking anxiety?**
A: No, and it deliberately makes no such claim. The warm-up and the gradually
bigger audience are confidence-building practice, not treatment.

**Q: What would you do next?**
A: In this order: (1) calibrate the thresholds against human ratings,
(2) fix the silent-take score and use the server-side audio duration,
(3) delete audio files when a take is deleted, (4) add a captions toggle,
(5) deal with Whisper dropping "um" (for example, a verbatim-style prompt or
model), and (6) a task queue if it ever serves many users.

---

## 20. Glossary

| Term                              | Meaning                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **wpm**                     | Words per minute.                                                                                            |
| **Filler**                  | A word that fills silence without meaning: um, uh, like, you know.                                           |
| **Pause / long pause**      | A gap between two words of at least 0.5 s / 3.0 s.                                                           |
| **Silence ratio**           | The share of the recording spent in gaps between words.                                                      |
| **Whisper**                 | OpenAI's open-source speech-recognition model. **faster-whisper** is a faster re-implementation of it. |
| **int8 quantisation**       | Storing model weights as 8-bit integers for speed and lower memory.                                          |
| **Word timestamps**         | The start and end time of each recognised word.                                                              |
| **Embedding**               | A list of numbers representing the meaning of a piece of text.                                               |
| **Cosine similarity**       | How closely two vectors point the same way: 1 is identical, 0 is unrelated.                                  |
| **MiniLM**                  | `all-MiniLM-L6-v2`, a small, fast sentence-embedding model.                                                |
| **RMS**                     | Root mean square: a standard measure of loudness from a waveform.                                            |
| **EMA**                     | Exponential moving average: smoothing that eases towards a target.                                           |
| **Monotonic**               | Only ever goes up, never down.                                                                               |
| **Baseline**                | Your first take's overall score, the reference point for Level 2.                                            |
| **Pure function / module**  | No side effects and no framework imports: the same input always gives the same output.                       |
| **ORM**                     | Object-relational mapper: Django's way of using database tables as Python classes.                           |
| **SPA**                     | Single-page application: one HTML page whose content React swaps.                                            |
| **CSRF**                    | Cross-site request forgery, explained in section 11.                                                         |
| **HttpOnly cookie**         | A cookie JavaScript cannot read.                                                                             |
| **Lazy loading**            | Loading something (a model, a page) only when it is first needed.                                            |
| **`lru_cache`**           | Python's memoisation decorator; here it keeps one model instance in memory.                                  |
| **Proxy (Vite)**            | The dev server forwards `/api` calls to Django so both appear on one origin.                               |
| **OpenAPI / `/api/docs`** | Machine-readable API description with an interactive page, generated by Django Ninja.                        |
| **Graduated exposure**      | Facing a bigger challenge step by step: here, bigger and tougher audiences as you level up.                  |

---

## 21. State of the repo right now

Know this before you demo from this machine.

- You are on branch **`redesign`**. Commit `726a64c` ("Studio redesign,
  stage 1") brought the console look to the landing page, Practice and
  Results. `master` has the older look and no landing page.
- The **Progress** page has **not** been restyled yet, so the look changes
  when you open it.
- **Own topics** (the Random | My own switch) were added on 17 November 2026,
  and on 18 November they began counting towards the delivery levels (1, 3, 4).
  Database migration `0003` must be applied (`python manage.py migrate`).
- The README and some code comments refer to **`HANDOFF.md`** (the original
  build spec), but that file **is not in the repo**. If an examiner asks for
  the spec, have it ready, or point to
  [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which carries the
  resolved decisions.
- The git history tells the build story in phases: backend core → frontend
  SPA → audience refactor → UI polish → audit harness → accounts, welcome
  reel and live captions → clip-timed reel.
