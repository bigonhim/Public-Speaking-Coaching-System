# Implementation Plan — Web-Based Public Speaking Coaching System

**Derived from:** `HANDOFF.md` (authoritative build spec)
**Owner:** Langat Achim Kipkorir · Dedan Kimathi University of Technology
**Status of repo:** empty — greenfield build
**This document:** the actionable, decision-resolved plan that turns the handoff into a deterministic build. It resolves every ambiguity in the spec, fixes exact formulas, specifies config file contents in full, defines every module's I/O contract, and gives a phase-by-phase checklist with verification gates.

> **How to use this plan.** Build strictly in phase order (§10). Do not scaffold ahead. Each phase has an explicit ✅ gate — do not start the next phase until the current gate passes. All scoring numbers trace to `scoring.yaml` (§5). The four pure modules (`metrics`, `scoring`, `feedback`, `levels`) never import Django.

---

## 0. Guiding constraints (carried verbatim from the handoff — treat as invariants)

1. **Transparency over cleverness.** Every score must render a sentence explaining *why*. No ML scoring.
2. **Scope discipline.** Build exactly what is specified. Out of scope: video, body language, prosody/pitch, non-English, multi-user/social, interview mode.
3. **Config over hardcoding.** Every weight/threshold/level rule lives in `backend/coach/config/scoring.yaml`. Changeable without touching logic.
4. **Pure, framework-free core.** `metrics.py`, `scoring.py`, `levels.py`, `feedback.py` — no Django imports. Plain data in, plain data out.
5. **Build in phases.** Verify each phase before the next. Commit at each boundary.

**Do-NOT list (guardrails, from §12):** no ML scoring · no video/camera/facial/pitch · no auth/multi-user/social · no interview mode (keep `Topic.category` pluggable only) · no Celery/Redis/queue · no DRF · no thresholds outside `scoring.yaml` · no Django imports in the four pure modules · never load Whisper/embeddings per-request or in `AppConfig.ready()` · no paid/cloud AI · never claim the tool treats/cures anxiety.

---

## 1. Resolved design decisions (ambiguities in the spec, settled here)

These are the judgment calls the spec leaves open. They are settled now so implementation is deterministic. Each is defensible in the viva.

| # | Ambiguity | Resolution |
|---|-----------|------------|
| D1 | `speaking_time_sec` definition | `last_word.end − first_word.start`. If `< 1e-6` (0/1 words) → treat as 0 and set `wpm = 0` (guard divide-by-zero). |
| D2 | Which duration in `silence_ratio` | Numerator = sum of **positive inter-word gaps only** (`max(0, gap_i)`); denominator = **full `duration_sec`** (the client-reported audio length). Leading/trailing silence is deliberately excluded from the numerator (it was already trimmed for `speaking_time`). Documented as intentional. |
| D3 | "Gaps" for pauses | Only between **consecutive words**: `gap_i = words[i+1].start − words[i].end`. Negative gaps (timestamp overlap) clamped to 0. Leading/trailing not counted as pauses. |
| D4 | Filler token normalization | Lowercase; strip leading/trailing punctuation (`.,!?;:"'()[]…`); match whole normalized token. Multi-word fillers matched over consecutive normalized tokens. |
| D5 | Level 6 "all four component scores in target range" | Interpreted as: each of `pace_score, filler_score, pause_score, relevance_score >= levels.orator.component_score_min` (default **70**) **AND** `overall_score >= 80`, for **≥2** sessions. Threshold lives in config. |
| D6 | Level 2 baseline | `baseline_overall` = the **first ever** session's `overall_score`, captured once and never overwritten. Level 2 needs `>=3` sessions total AND latest `overall >= baseline + 5`. |
| D7 | "Last 5" | The 5 most recent sessions by `created_at` (or all if fewer than 5). |
| D8 | Progress-to-next fraction | Computed per candidate next level as `min(met, required)/required` where "met" is the count/margin toward that level's rule (formulas in §6.3). Always paired with a human `progress_text`. |
| D9 | Level monotonicity | `UserState.current_level = max(current_level, evaluate(...))`. Recomputed after every session. Never decreases even if later sessions regress. |
| D10 | Audio container | Frontend records `audio/webm;codecs=opus` (Chrome default). faster-whisper decodes via bundled PyAV/ffmpeg — no separate ffmpeg install required in the common case (fallback noted in §2). |
| D11 | `duration_sec` source of truth | Measured **client-side** (recording stopwatch / `AudioContext`), sent as a form field. Server trusts it for `silence_ratio` denominator; `speaking_time` comes from word timestamps independently. |
| D12 | Relevance embedding | L2-normalize both embeddings, cosine = dot product. Embed full transcript vs full `topic_text`. Store **raw** cosine in `relevance_similarity` regardless of score mapping. |
| D13 | Empty/failed transcript | If transcript is empty (silence / decode fail): `word_count=0`, all metric-derived scores computed on empty input → `wpm=0`, `filler_*=0`, relevance computed on `""` (low). Session still saved; feedback explains "we couldn't hear speech." No 500. |
| D14 | Score rounding | Component scores rounded to 1dp for storage/display; `overall` rounded to 1dp. Internal math uses full precision, round only at the boundary. |
| D15 | Single-user state | Exactly one `UserState` row, `pk=1`, created on first access via `get_or_create(pk=1)`. |

---

## 2. Environment & dependencies (exact)

**Backend — `backend/requirements.txt`:**
```
Django==5.1.*
django-ninja==1.3.*
django-cors-headers==4.4.*
faster-whisper==1.0.*
sentence-transformers==3.0.*
PyYAML==6.*
pytest==8.*
pytest-django==4.9.*
```
- `faster-whisper` pulls `ctranslate2` + `av` (PyAV bundles ffmpeg libs → decodes webm/opus). If decode ever fails on this machine, install ffmpeg and put it on PATH (fallback only).
- `sentence-transformers` pulls `torch` (CPU wheel). First install is large/slow on Windows — expected.
- Python **3.11+**. Use a venv: `python -m venv .venv` then activate.

**Frontend — key `package.json` deps:**
```
react, react-dom            ^18
react-router-dom            ^6
recharts                    ^2
@dicebear/core              ^9
@dicebear/collection        ^9
```
Dev: `vite`, `typescript`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom`.

**Model sizing:** `WHISPER_MODEL_SIZE` from env, default `small` (dev), `medium` (prod). `compute_type="int8"`, `device="cpu"`.

**Windows note:** primary shell is PowerShell. Run backend and frontend in two terminals. `python manage.py runserver` (:8000) + `npm run dev` (:5173).

---

## 3. Repository scaffolding (Phase 1 mechanics)

```
speaking-coach/                 # = the Project root
├── backend/
│   ├── .venv/                  # gitignored
│   ├── manage.py
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── config/                 # django-admin startproject config .
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── coach/                  # startapp coach
│   │   ├── models.py
│   │   ├── admin.py
│   │   ├── api.py
│   │   ├── schemas.py
│   │   ├── apps.py
│   │   ├── migrations/
│   │   ├── config/
│   │   │   ├── scoring.yaml
│   │   │   └── fillers.yaml
│   │   ├── data/topics.json
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── transcription.py     # I/O allowed
│   │   │   ├── relevance.py         # I/O allowed
│   │   │   ├── metrics.py           # PURE
│   │   │   ├── scoring.py           # PURE
│   │   │   ├── feedback.py          # PURE
│   │   │   ├── levels.py            # PURE
│   │   │   └── config_loader.py
│   │   └── management/commands/
│   │       ├── seed_topics.py
│   │       └── seed_fake_sessions.py
│   └── tests/
│       ├── test_metrics.py
│       ├── test_scoring.py
│       ├── test_levels.py
│       └── test_api.py
├── frontend/                   # npm create vite@latest -- --template react-ts
│   └── src/ ...                # see §9
├── data/                       # sqlite + media/audio  (gitignored)
├── .gitignore
├── IMPLEMENTATION_PLAN.md      # this file
└── README.md
```

`.gitignore` essentials: `.venv/`, `__pycache__/`, `data/`, `*.pyc`, `node_modules/`, `frontend/dist/`, `.pytest_cache/`.

**`config/settings.py` must set:**
- `BASE_DIR` → backend dir; `MEDIA_ROOT = BASE_DIR.parent / "data" / "media"`, `MEDIA_URL = "/media/"`
- `DATABASES` sqlite → `BASE_DIR.parent / "data" / "app.db"`
- `WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")`
- `INSTALLED_APPS += ["corsheaders", "coach"]`
- `MIDDLEWARE` prepend `corsheaders.middleware.CorsMiddleware`
- `CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]` (dev only)
- Ensure `data/` and `data/media/` exist (create in settings or a startup step).

**`config/urls.py`:** mount `admin/` and `api/` (Ninja router). Serve `MEDIA_URL` from `MEDIA_ROOT` in dev (`static()` helper).

---

## 4. Scoring math — worked out exactly (single source of truth for tests)

All constants come from `scoring.yaml` (§5). Formulas below are what `scoring.py` implements; the worked numbers are the fixtures for `test_scoring.py`.

### 4.1 Pace
```
if target_min <= wpm <= target_max:        score = 100
elif wpm < target_min:  distance = target_min - wpm
else:                   distance = wpm - target_max
score = clamp(100 - falloff_per_wpm * distance, 0, 100)
```
Fixtures: `120→100`, `150→100`, `135→100`, `168→100−1.5·18=73.0`, `100→100−1.5·20=70.0`, `60→100−1.5·60=10.0`, `20→clamp(−50)=0`.

### 4.2 Filler
```
if fpm <= ideal_max_per_min:   score = 100
elif fpm >= zero_score_per_min: score = 0
else: score = 100 * (zero_score_per_min - fpm) / (zero_score_per_min - ideal_max_per_min)
```
Fixtures (`ideal=1.0`, `zero=8.0`): `1.0→100`, `8.0→0`, `3.0→100·(5/7)=71.4`, `0.5→100`, `10→0`.

### 4.3 Pause
```
score = 100
score -= long_pause_penalty * long_pause_count
if silence_ratio > silence_ratio_ceiling:
    score -= (silence_ratio - silence_ratio_ceiling) * silence_penalty_per_point
if pause_count == 0:
    score -= no_pause_penalty
score = clamp(score, 0, 100)
```
Fixtures: `long=0, ratio=0.20, pauses=4 → 100`; `long=2, ratio=0.35, pauses=5 → 100−30=70`; `long=0, ratio=0.45, pauses=3 → 100−(0.10·100)=90`; `long=0, ratio=0.10, pauses=0 → 100−10=90`; `long=3,ratio=0.50,pauses=0 → 100−45−15−10=30`.

### 4.4 Relevance
```
if sim <= sim_floor:    score = 0
elif sim >= sim_ceiling: score = 100
else: score = 100 * (sim - sim_floor) / (sim_ceiling - sim_floor)
```
Fixtures (`floor=0.15`, `ceiling=0.55`): `0.15→0`, `0.55→100`, `0.35→50.0`, `0.10→0`, `0.60→100`.

### 4.5 Overall
```
overall = round(
    w_pace*pace + w_filler*filler + w_pause*pause + w_relevance*relevance, 1)
```
with weights `0.25/0.25/0.15/0.35`. Fixture: `pace=100,filler=100,pause=100,relevance=100 → 100.0`; `pace=73,filler=71.4,pause=90,relevance=50 → 0.25·73+0.25·71.4+0.15·90+0.35·50 = 18.25+17.85+13.5+17.5 = 67.1`.

### 4.6 Metrics
```
speaking_time_sec = max(0, last_word.end - first_word.start)          # D1
wpm = 0 if speaking_time_sec < 1e-6 else word_count / (speaking_time_sec/60)
gaps = [max(0, words[i+1].start - words[i].end) for i in range(len-1)]  # D3
pause_count      = count(g >= pause_min_sec)                            # 0.5
long_pause_count = count(g >= long_pause_sec)                           # 3.0
silence_ratio    = sum(gaps) / duration_sec  (0 if duration_sec<=0)     # D2
filler_count     = matches over normalized tokens (single + multiword)  # D4
filler_per_min   = 0 if speaking_time_sec<1e-6 else filler_count/(speaking_time_sec/60)
```

---

## 5. Config files — full contents

### 5.1 `backend/coach/config/scoring.yaml`
```yaml
weights:
  pace: 0.25
  filler: 0.25
  pause: 0.15
  relevance: 0.35

metrics:
  pause_min_sec: 0.5
  long_pause_sec: 3.0

pace:
  target_min: 120
  target_max: 150
  falloff_per_wpm: 1.5

filler:
  ideal_max_per_min: 1.0
  zero_score_per_min: 8.0

pause:
  long_pause_penalty: 15
  silence_ratio_ceiling: 0.35
  silence_penalty_per_point: 100
  no_pause_penalty: 10

relevance:
  sim_floor: 0.15
  sim_ceiling: 0.55

feedback:
  max_notes: 3
  fast_wpm: 150
  slow_wpm: 120
  filler_per_min_warn: 3
  long_pause_warn: 2
  relevance_score_warn: 60

levels:
  min_session_sec: 45          # L1
  l2_min_sessions: 3           # L2
  l2_improvement: 5            # latest >= baseline + 5
  window: 5                    # "last N"
  pace_in_range_needed: 3      # L3: >=3 of last 5 with 120<=wpm<=150
  filler_ok_needed: 3          # L4: >=3 of last 5 with filler_per_min < 3
  filler_ok_threshold: 3       # filler_per_min < this
  relevance_high_needed: 3     # L5: >=3 of last 5 with relevance_score >= threshold
  relevance_high_threshold: 80
  orator:                      # L6
    sessions_needed: 2
    overall_min: 80
    component_score_min: 70    # D5: all four component scores >= this
  master:                      # L7
    of_last: 5
    needed: 4
    overall_min: 85
```

### 5.2 `backend/coach/config/fillers.yaml`
```yaml
# case-insensitive, whole-token after punctuation strip
single:
  - um
  - uh
  - er
  - erm
  - ah
  - hmm
  - like
  - so
  - actually
  - basically
  - literally
  - honestly
  - right
  - well
  - okay
multi:                 # matched over consecutive tokens
  - [you, know]
  - [i, mean]
  - [sort, of]
  - [kind, of]
```
> Calibration note in README: `like/so/well/right/actually` are legitimate words and will over-count for some speakers; these defaults are a starting point to be tuned against human ratings, not ground truth.

### 5.3 `config_loader.py`
```python
from functools import lru_cache
from pathlib import Path
import yaml

_CFG_DIR = Path(__file__).resolve().parent.parent / "config"

@lru_cache(maxsize=1)
def load_scoring() -> dict:
    with open(_CFG_DIR / "scoring.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)

@lru_cache(maxsize=1)
def load_fillers() -> dict:
    with open(_CFG_DIR / "fillers.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)
```
Pure modules receive the returned **dicts as arguments** — they never call the loader or Django themselves.

---

## 6. Pure module contracts (`no Django imports`)

### 6.1 `metrics.py`
```python
def compute_metrics(words: list[dict], duration_sec: float, cfg: dict,
                    fillers: dict) -> dict:
    """words: [{'word','start','end'}] ; returns:
    { word_count, speaking_time_sec, wpm, filler_count, filler_per_min,
      pause_count, long_pause_count, silence_ratio }"""
```
- Normalize tokens once (D4). Single-filler set + multi-word sequences.
- Implements §4.6 exactly. No rounding here (raw floats); API layer rounds for storage where the model column is display-facing, but keep `silence_ratio`, `wpm` etc. as computed.

### 6.2 `scoring.py`
```python
def score_pace(wpm, cfg) -> float
def score_filler(filler_per_min, cfg) -> float
def score_pause(pause_count, long_pause_count, silence_ratio, cfg) -> float
def score_relevance(similarity, cfg) -> float
def score_all(metrics: dict, similarity: float, cfg: dict) -> dict:
    """returns { pace, filler, pause, relevance, overall } all rounded 1dp"""
```
- `clamp(x,lo,hi)` helper. Implements §4.1–4.5. Weighted overall from `cfg['weights']`.

### 6.3 `levels.py`
```python
def evaluate(sessions: list[dict], baseline: float | None, cfg: dict) -> int:
    """sessions newest-first or oldest-first? -> define: pass NEWEST-FIRST.
       Returns highest level (1..7) whose condition holds, else 0."""

def progress_to_next(sessions, baseline, current_level, cfg) -> dict:
    """returns { next_level, progress_fraction (0..1), progress_text }"""

def describe(level: int) -> dict:   # { level, name, award }
```
Session dict fields consumed: `duration_sec, overall_score, wpm, filler_per_min, relevance_score, pace_score, filler_score, pause_score`.

**Level conditions (exact, from §6 of handoff + D5/D7):**
- **L1**: any session `duration_sec >= min_session_sec` (45).
- **L2**: `len(sessions) >= 3` AND `latest.overall_score >= baseline + l2_improvement`.
- **L3**: count(`120 <= wpm <= 150`) in last 5 `>= 3`.
- **L4**: count(`filler_per_min < 3`) in last 5 `>= 3`.
- **L5**: count(`relevance_score >= 80`) in last 5 `>= 3`.
- **L6**: `>= 2` sessions with `overall_score >= 80` AND all of `pace/filler/pause/relevance_score >= 70`.
- **L7**: count(`overall_score >= 85`) in last 5 `>= 4`.
- Return `max` level met; caller applies monotonicity (D9).

**Progress fractions** (toward `current_level + 1`; text mirrors the rule):
- →L1: `min(max_duration_seen, 45)/45`, "Record one 45s+ take".
- →L2: combine sessions-count fraction and improvement margin; text "N of 3 sessions" / "+X vs baseline".
- →L3/4/5: `min(count,3)/3`, "2 of 3 sessions with pace in range" (etc).
- →L6: `min(qualifying,2)/2`.
- →L7: `min(count,4)/4`.
- If already L7: fraction `1.0`, text "Master Orator — top rung".

**Names/awards** (`describe`): 1 Novice/"First Voice" · 2 Apprentice/"Finding Your Voice" · 3 Speaker/"Steady Pace" · 4 Communicator/"Clear Voice" · 5 Persuader/"On Point" · 6 Orator/"Commanding Presence" · 7 Master Orator/"Master Orator" trophy.

### 6.4 `feedback.py`
```python
def build_feedback(metrics: dict, scores: dict, cfg: dict) -> list[str]:
    """returns up to cfg['feedback']['max_notes'] strings,
       prioritised by largest component-score deficit (100 - score)."""
```
- Candidate rules (each yields a specific string with the real number interpolated):
  - `wpm > fast_wpm` → "You spoke quite fast ({wpm:.0f} wpm). Aim for 120–150 — try pausing at full stops."
  - `wpm < slow_wpm` (and >0) → "Your pace was a little slow ({wpm:.0f} wpm). A touch more energy keeps the room with you."
  - `filler_per_min > filler_per_min_warn` → "You used fillers about {filler_per_min:.0f}×/min. A short silent pause is stronger than an 'um'."
  - `long_pause_count > long_pause_warn` → "You had {long_pause_count} pauses over 3s. Brief pauses are good; long ones lose the room."
  - `relevance_score < relevance_score_warn` → "Your speech drifted from the topic. Name its key terms early and return to them."
  - **all good** (no rule fired) → specific praise using the best component, e.g. "Great pace ({wpm:.0f} wpm) and on-topic throughout — that's a strong, confident take."
  - empty transcript (D13) → "We couldn't hear clear speech. Check your mic and try again in a quiet spot."
- Sort fired rules by deficit desc, cap at `max_notes` (3).

---

## 7. Service modules (I/O allowed — Django-aware)

### 7.1 `transcription.py`
```python
from functools import lru_cache

@lru_cache(maxsize=1)
def get_model():
    from faster_whisper import WhisperModel
    from django.conf import settings
    return WhisperModel(settings.WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")

def transcribe(audio_path: str) -> dict:
    segments, info = get_model().transcribe(audio_path, word_timestamps=True,
                                            vad_filter=False, language="en")
    words = []
    for seg in segments:
        for w in (seg.words or []):
            words.append({"word": w.word, "start": w.start, "end": w.end})
    transcript = "".join(w["word"] for w in words).strip()
    return {"transcript": transcript, "words": words, "word_count": len(words)}
```
- Model loads **once**, lazily, never in `AppConfig.ready()`.
- `language="en"` (English-only scope). `word_timestamps=True` is mandatory.

### 7.2 `relevance.py`
```python
from functools import lru_cache

@lru_cache(maxsize=1)
def get_embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2", device="cpu")

def similarity(transcript: str, topic_text: str) -> float:
    import numpy as np
    m = get_embedder()
    a, b = m.encode([transcript or "", topic_text], normalize_embeddings=True)
    return float(np.dot(a, b))   # cosine, both L2-normalized
```
- Store the raw value in `relevance_similarity` (D12). Never in `AppConfig.ready()`.

---

## 8. Data model & API layer

### 8.1 Models (`models.py`) — as in handoff §4, plus:
- `UserState` accessed via `UserState.objects.get_or_create(pk=1, defaults=...)` (D15).
- `Topic.category` stays a plain indexed CharField (pluggable, D per §4 note). No enum, no interview logic.
- `Session.words_json` stores `[{word,start,end}]`; `feedback_json` stores `list[str]`.

### 8.2 `admin.py`
- Register `Topic`, `Session`, `UserState`.
- `SessionAdmin.list_display = ("id","created_at","topic_text","overall_score")`; make computed/metric fields `readonly_fields`; `ordering=("-created_at",)`.

### 8.3 Schemas (`schemas.py`, Ninja/Pydantic) — match §7 contract exactly
`TopicOut`, `SessionCreateOut{session_id}`, `MetricsOut`, `ScoresOut`, `WeightsOut`, `WordOut`, `SessionDetailOut`, `SessionListItemOut`, `ProgressOut`, `LevelOut`. Every field named exactly as the API contract so `/api/docs` is truthful.

### 8.4 Endpoints (`api.py`, Ninja router at `/api`)
| Method | Path | Behavior |
|--------|------|----------|
| GET | `/topics/random?category=general` | random `Topic` in category → `{id,text,category}`. 404 if none. |
| POST | `/sessions` (multipart) | fields `audio`, `topic_id`, `duration_sec`. **Synchronous pipeline**: save audio (FileField) → `transcribe` → `compute_metrics` → `similarity` → `score_all` → `build_feedback` → persist Session → recompute + `max` level on `UserState` → `201 {session_id}`. |
| GET | `/sessions/{id}` | full breakdown incl. `weights` (from `cfg['weights']`) and `words`. |
| GET | `/sessions?limit=20&offset=0` | list `{id,created_at,topic_text,overall_score}`. |
| GET | `/progress` | `{sessions:[{created_at,overall,pace,filler,pause,relevance}], baseline_overall, session_count}` (oldest→newest for charting). |
| GET | `/level` | `{current_level,name,award,next_level,next_name,progress_fraction,progress_text,unlocked:[{level,name,award}]}`. |

**POST /sessions pipeline is the integration seam** — it is the only place that wires pure modules to Django. Keep it thin: load config dicts, call pure functions, write fields.

**Baseline capture:** on the first ever session, set `UserState.baseline_overall = overall_score` if currently null.

---

## 9. Frontend architecture

**Bootstrap:** `npm create vite@latest frontend -- --template react-ts`; add Tailwind (`tailwind.config`, `postcss`, `index.css` directives); React Router.

**`src/api/client.ts`** — typed fetch wrapper, base `http://localhost:8000/api`. Functions: `getRandomTopic`, `createSession(formData)`, `getSession(id)`, `listSessions`, `getProgress`, `getLevel`. TS interfaces mirror `schemas.py`.

**Hooks:**
- `useRecorder.ts` — MediaRecorder lifecycle; returns `{start, stop, blob, isRecording, elapsedSec}`; records `audio/webm;codecs=opus`; tracks `elapsedSec` for `duration_sec`.
- `useLiveAudio.ts` — `AudioContext` + `AnalyserNode`; exposes rolling **RMS**, **silence timer**, **voiced-onset rate** (§8 handoff). Client-side only. **No filler detection** (impossible live — never imply it in UI).

**Pages:**
- `PracticePage.tsx` — flow: fetch random topic → optional `BreathingRitual` (localStorage remembers skip) → `Recorder` with live `VirtualAudience` → on stop, POST session → route to Results with real loading state (transcription takes seconds; show progress, never a frozen button).
- `ResultsPage.tsx` — overall score + four `ScoreBreakdown` bars; **each bar shows raw metric, its component score, and its weight** (transparency mandate). Render `feedback` notes. A user must be able to explain their score from this screen alone.
- `ProgressPage.tsx` — Recharts trend of overall + components over time; `LevelLadder` (7 rungs, current highlighted, progress-to-next bar + text); empty state when no sessions.

**Components:** `BreathingRitual` (expand/contract circle ~4s/4s ×2 then 3-2-1, then auto-start; Skip always visible; calm, no scores) · `Recorder` · `VirtualAudience` (engagement EMA α≈0.2, face states per §8, per-face 300–1200ms reaction delay + bias, **never flip a face more than once per ~2s**, size/forgiveness from level with manual override, DiceBear faces 6–12 max, empty-room mode) · `AudienceFace` (DiceBear options swap for expression) · `ScoreBreakdown` · `LevelLadder`.

**Audience difficulty ladder (from level):** L1–2 → 0 or 3 faces, very forgiving · L3–4 → 6, forgiving · L5–6 → 9, normal · L7 → 12, tough (faster decay). Framing strictly confidence-building via graduated exposure — never therapy/cure language.

---

## 10. Build phases — task breakdown & verification gates

> Commit at each ✅. Do not proceed until the gate passes.

### Phase 1 — Django skeleton + capture
- [ ] venv, `requirements.txt`, install.
- [ ] `startproject config .`, `startapp coach`; settings (MEDIA_ROOT, CORS, WHISPER_MODEL_SIZE, sqlite in `data/`).
- [ ] Models (`Topic`,`Session`,`UserState`) + `makemigrations`/`migrate` (commit migrations).
- [ ] `admin.py` registrations.
- [ ] `data/topics.json` (~40 prompts, Appendix A) + `seed_topics` command.
- [ ] Ninja mounted `/api`; `GET /topics/random`.
- [ ] Vite app; `useRecorder`; `POST /sessions` stores **audio only** (no analysis yet).
- ✅ **Gate:** record 60s in browser → file appears in `data/media/audio/` → Session row visible in Django admin. `/api/docs` renders.

### Phase 2 — Transcription
- [ ] `transcription.py` (lru_cache singleton, int8, word_timestamps).
- [ ] POST pipeline stores `transcript`, `word_count`, `words_json`.
- ✅ **Gate:** transcript + word timings sane for a real recording; **second request does not reload the model** (log once / time it).

### Phase 3 — Metrics + tests
- [ ] `metrics.py` (pure) per §4.6/§6.1.
- [ ] `config_loader.py`.
- [ ] `tests/test_metrics.py` — synthetic word lists, hand-computed wpm/fillers/gaps/silence_ratio (Appendix B).
- ✅ **Gate:** `pytest` green; metrics match fixtures exactly.

### Phase 4 — Relevance + scoring + feedback
- [ ] `relevance.py` (cached embedder, raw sim stored).
- [ ] `scoring.py`, `feedback.py` (pure).
- [ ] Wire full pipeline in `POST /sessions`; `GET /sessions/{id}` returns full breakdown incl. `weights`.
- [ ] `tests/test_scoring.py` — boundaries (pace 120/150, filler 1.0/8.0, sim floor/ceiling) + clamping (§4 fixtures).
- ✅ **Gate:** fluent-but-off-topic speech scores low on relevance; rushed speech loses pace points. `pytest` green.

### Phase 5 — Results UI (transparency)
- [ ] `ResultsPage` + `ScoreBreakdown`: overall + 4 bars each showing raw metric, score, weight; feedback notes.
- [ ] Real loading/error states during transcription.
- ✅ **Gate:** a user can explain their own score from the screen alone.

### Phase 6 — Levels + progress dashboard
- [ ] `levels.py` (pure) + `tests/test_levels.py` (monotonicity, "3 of last 5", baseline, L6 conjunction) — Appendix B.
- [ ] `seed_fake_sessions` command (synthetic sessions for demo).
- [ ] `GET /level`, `GET /progress`; `ProgressPage` (Recharts trends + `LevelLadder`).
- ✅ **Gate:** levels never regress; unlocking works against seeded data; `pytest` green.

### Phase 7 — Breathing ritual + virtual audience
- [ ] `BreathingRitual.tsx` (skippable, localStorage).
- [ ] `useLiveAudio` (RMS/VAD/onset-rate); `VirtualAudience.tsx`; `AudienceFace.tsx` (DiceBear).
- [ ] Difficulty from level + manual override; empty-room mode.
- ✅ **Gate:** faces react within ~1s, smoothly, not in lockstep; empty-room works; no live-filler implication anywhere.

### Phase 8 — Polish
- [ ] Loading/error/empty states throughout; mobile-responsive practice page.
- [ ] `test_api.py` — Ninja endpoints via Django test client, **mocking `transcribe` and `similarity`** (no live models in tests).
- [ ] `pytest.ini` with `DJANGO_SETTINGS_MODULE=config.settings`.
- [ ] README: setup, model config, how to change scoring weights.
- ✅ **Gate:** Definition of Done (§13) fully met.

---

## 11. Testing plan (the academic core must be provably correct)

- **`pytest.ini`:** `[pytest]` → `DJANGO_SETTINGS_MODULE = config.settings`, `python_files = tests.py test_*.py *_tests.py`, `pythonpath = .`.
- **`test_metrics.py`** — synthetic `words` fixtures with known answers (Appendix B): wpm exact, filler single+multiword, pause/long-pause counts at threshold, silence_ratio, empty-word guard.
- **`test_scoring.py`** — every fixture in §4; boundary values exactly at thresholds; clamp never `<0` or `>100`; overall weighting.
- **`test_levels.py`** — L1..L7 unlock, monotonic `max` (regression can't lower level), "3 of last 5" windowing, baseline capture, L6 four-way conjunction, progress fractions.
- **`test_api.py`** — Django test client; **mock** `services.transcription.transcribe` and `services.relevance.similarity` so no model loads; assert POST pipeline persists correct fields and status codes; assert schema shapes match `/api/docs`.
- Never test against live Whisper output. Hand-computed fixtures only.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| MiniLM cosine sims are low for short-topic vs long-speech | `sim_floor/ceiling` are explicit config; always store raw sim; README flags calibration; never hardcode. |
| Filler over-counting (`like/so/well`) | Config-driven list; note in README; whole-token match after normalization. |
| First transcription is slow (model download + load) | Lazy `lru_cache` singleton; real loading UI; document first-run cost. |
| webm/opus decode | PyAV bundled with faster-whisper; ffmpeg fallback documented. |
| Blocking request during transcription | Accepted per handoff (single-user); raise server timeout; honest loading state; no queue. |
| Windows path/venv friction | Absolute `MEDIA_ROOT`; `data/` created at startup; two-terminal run documented. |
| Jittery audience destroys the effect | Enforce ≤1 face change / ~2s + per-face delay/bias + EMA smoothing. |

---

## 13. Definition of Done (from handoff §13 — final checklist)

- [ ] `python manage.py runserver` + `npm run dev` runs the whole system locally.
- [ ] Full user journey works: topic → optional breathing ritual → record with reacting audience → transparent explained score → progress + level.
- [ ] `pytest` green (metrics/scoring/levels/api).
- [ ] Django admin shows Topics/Sessions/UserState.
- [ ] `/api/docs` renders accurate schemas.
- [ ] README documents setup, model config, and how to change scoring weights.
- [ ] Every number shown to a user traces to `scoring.yaml`.

---

## Appendix A — seed topics (`topics.json`, category `general`, ~40)

General public-speaking prompts (impromptu-friendly, English, opinion/experience based):
1. Describe a person who changed the way you think.
2. Should university education be free? Argue your position.
3. Talk about a skill everyone should learn and why.
4. Describe your ideal city of the future.
5. Is social media good or bad for society?
6. Convince us to visit your hometown.
7. What does success mean to you?
8. Describe a book or film that stayed with you.
9. Should phones be banned in schools?
10. Talk about a time you failed and what you learned.
11. What is the most important invention in history?
12. Describe a tradition worth preserving.
13. Is it better to be a specialist or a generalist?
14. Persuade us to adopt one new daily habit.
15. What problem in your community would you fix first?
16. Describe the best advice you ever received.
17. Should we colonize other planets?
18. Talk about a hobby and why it matters to you.
19. Is honesty always the best policy?
20. Describe a moment you felt truly proud.
21. What role should AI play in education?
22. Convince us that failure is useful.
23. Describe your perfect weekend.
24. Should voting be mandatory?
25. Talk about someone you admire and why.
26. What would you change about your country's schools?
27. Is competition healthy or harmful?
28. Describe a place that feels like home.
29. Should we work a four-day week?
30. Talk about a cause you care about.
31. What makes a good leader?
32. Describe a challenge worth taking on.
33. Is technology making us more or less connected?
34. Convince us to read more books.
35. What does courage look like in everyday life?
36. Describe a lesson sport or games taught you.
37. Should cities ban cars from centers?
38. Talk about a goal you're working toward.
39. What is one thing schools should teach but don't?
40. Describe the world you hope to see in twenty years.

## Appendix B — key test fixtures (hand-computed)

**Metrics fixture M1** (clean speech): words spanning `start=0.0` first word, `end=30.0` last word, `word_count=75`, `duration_sec=32`, two gaps of `0.6s` and one of `3.2s`.
- `speaking_time_sec = 30.0` → `wpm = 75/(30/60) = 150.0`
- gaps `[0.6,3.2]` (plus zeros) → `pause_count=2` (both ≥0.5), `long_pause_count=1` (3.2≥3.0)
- `silence_ratio = (0.6+3.2)/32 = 0.11875`

**Metrics fixture M2** (fillers): tokens `["So","um","the","point","is","you","know","clear"]`, single fillers `so,um` + multiword `you know` → `filler_count=3`.

**Scoring:** all §4 fixtures.

**Levels fixture L1** (monotonicity): sessions push level to 5, then two poor sessions → `evaluate` returns 2, but stored `current_level` stays `max(5,2)=5`.

**Levels fixture L6:** 2 sessions each `overall=82` with `pace=90,filler=85,pause=75,relevance=88` → L6 met; drop one component to `65` → not met.
