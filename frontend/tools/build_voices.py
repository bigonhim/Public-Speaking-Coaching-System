# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper>=1.0", "yt-dlp[default]", "imageio-ffmpeg"]
# ///
"""Cut the welcome reel's clips and time their words.

For each voice in src/data/voices.ts this finds the quoted sentence inside a
longer recording, trims a clip tightly around it, and records the second at
which each on-screen word is spoken. The reel plays the clip and lights the
words from those timings, so what you read and what you hear cannot disagree.

    uv run tools/build_voices.py                 # every voice in the manifest
    uv run tools/build_voices.py --only king     # just one
    uv run tools/build_voices.py --check         # verify the finished clips

Inputs
    src/data/voices.ts          the quotes (read, never written)
    tools/voices.sources.json   id -> { sources, picture? }. Sources are tried
                                in order; each is a URL yt-dlp understands or a
                                local file. Set "picture": false to keep only
                                the sound, for a recording whose video is a
                                slideshow rather than footage of the speech.

Outputs
    public/voices/<id>.mp4      the trimmed, loudness-matched clip
                                (<id>.m4a when it is sound only)
    src/data/voiceClips.json    { id: { src, duration, picture, words: [...] } }

The quote is located by transcribing the recording (faster-whisper), so the
cue point is measured rather than guessed. If the speaker's words differ from
the text in voices.ts the report says so — fix the quote, not the timing.

Downloads and transcripts are cached outside the repo (see --cache), so a
re-run after editing a quote costs seconds.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
VOICES_TS = FRONTEND / "src" / "data" / "voices.ts"
MANIFEST = FRONTEND / "tools" / "voices.sources.json"
OUT_DIR = FRONTEND / "public" / "voices"
OUT_JSON = FRONTEND / "src" / "data" / "voiceClips.json"

# Room either side of the sentence. The lead lets the fade-in finish before the
# first word; the tail lets the last word ring out instead of being clipped.
LEAD_S = 0.45
TAIL_S = 1.1
# ...and the least they shrink to when the neighbouring sentence is close.
MIN_LEAD_S = 0.12
MIN_TAIL_S = 0.4
FADE_IN_S = 0.12
FADE_OUT_S = 0.55
# Every clip is normalised to the same loudness, so a 1940 radio recording and
# a 2013 broadcast feed do not jump in volume from one slide to the next.
LOUDNESS = "I=-16:TP=-1.5:LRA=11"
# A quote must match at least this share of its words to be trusted.
MIN_SCORE = 0.8


@dataclass
class Word:
    text: str
    start: float
    end: float

    @property
    def norm(self) -> str:
        return normalise(self.text)


def normalise(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def read_quotes() -> dict[str, str]:
    """Pull `id` / `quote` pairs out of voices.ts without a TypeScript parser."""
    source = VOICES_TS.read_text(encoding="utf-8")
    pattern = re.compile(
        r"id:\s*'(?P<id>[\w-]+)'.*?quote:\s*(?P<q>['\"])(?P<text>(?:\\.|(?!(?P=q)).)*)(?P=q)",
        re.S,
    )
    return {
        m["id"]: re.sub(r"\\(.)", r"\1", m["text"]) for m in pattern.finditer(source)
    }


# --- tools -------------------------------------------------------------------


def ffmpeg_exe(cache: Path) -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg

    # yt-dlp wants a binary literally called ffmpeg, so keep a plainly named copy.
    local = cache / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
    if not local.exists():
        shutil.copy2(imageio_ffmpeg.get_ffmpeg_exe(), local)
    return str(local)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    )


def fetch(source: str, cache: Path, ffmpeg: str) -> Path | None:
    """Return a local media file for a source, downloading it if needed."""
    if not re.match(r"^https?://", source):
        path = (MANIFEST.parent / source).resolve()
        return path if path.exists() else None

    key = re.sub(r"[^\w-]", "_", source.split("v=")[-1])[-40:]
    existing = [p for p in cache.glob(f"{key}.*") if p.suffix in {".mp4", ".mkv", ".webm"}]
    if existing:
        return existing[0]

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist", "--no-warnings", "--quiet",
        "--js-runtimes", "node",
        "-f", "bv*[height<=720]+ba/b[height<=720]/b",
        "--merge-output-format", "mp4",
        "--ffmpeg-location", ffmpeg,
        "-o", str(cache / f"{key}.%(ext)s"),
        source,
    ]
    result = run(cmd)
    existing = [p for p in cache.glob(f"{key}.*") if p.suffix in {".mp4", ".mkv", ".webm"}]
    if not existing:
        print(f"    download failed: {(result.stderr or result.stdout).strip()[-300:]}")
        return None
    return existing[0]


_model = None


def transcribe(media: Path, cache: Path, model_size: str, tag: str = "") -> list[Word]:
    """Word-level transcript of a file, cached beside the download."""
    cached = cache / f"{media.stem}{tag}.{model_size}.words.json"
    if cached.exists():
        return [Word(**w) for w in json.loads(cached.read_text(encoding="utf-8"))]

    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, _ = _model.transcribe(
        str(media),
        language="en",
        word_timestamps=True,
        # Each window stands alone: a long speech with applause otherwise lets
        # one bad guess snowball into the next thirty seconds.
        condition_on_previous_text=False,
    )
    words = [
        Word(w.word.strip(), float(w.start), float(w.end))
        for seg in segments
        for w in (seg.words or [])
        if normalise(w.word)
    ]
    cached.write_text(json.dumps([w.__dict__ for w in words]), encoding="utf-8")
    return words


# --- alignment ---------------------------------------------------------------


@dataclass
class Alignment:
    score: float
    first: int  # index into the transcript of the first matched word
    last: int  # ... and the last
    mapping: dict[int, int]  # quote word index -> transcript word index


def align(quote: list[str], words: list[Word]) -> Alignment | None:
    """Find where the quote is spoken, tolerating skipped or misheard words."""
    tokens = [w.norm for w in words]
    span = int(len(quote) * 2.2) + 6
    best: Alignment | None = None

    for i in range(len(tokens)):
        window = tokens[i : i + span]
        matcher = SequenceMatcher(None, quote, window, autojunk=False)
        blocks = [b for b in matcher.get_matching_blocks() if b.size]
        if not blocks or blocks[0].b != 0:
            # Only score windows that open on a matched word, so the same
            # passage is not re-scored from every offset before it.
            continue
        matched = sum(b.size for b in blocks)
        first = i + blocks[0].b
        last = i + blocks[-1].b + blocks[-1].size - 1
        # Prefer the tightest reading: the same words spread over twice the
        # speech are a looser match than the sentence said straight through.
        score = matched / len(quote) - 0.004 * max(0, (last - first + 1) - len(quote))
        if best is None or score > best.score:
            mapping = {b.a + k: i + b.b + k for b in blocks for k in range(b.size)}
            # A run the transcriber misheard ("idea" for "ideal") still marks
            # when those words were said, so pair them off one for one.
            for tag, a1, a2, b1, b2 in matcher.get_opcodes():
                if tag == "replace" and a2 - a1 == b2 - b1 and a1 > 0 and i + b2 <= last:
                    mapping.update({a1 + k: i + b1 + k for k in range(a2 - a1)})
            best = Alignment(score, first, last, mapping)
    return best


def word_times(quote: list[str], words: list[Word], alignment: Alignment) -> list[float]:
    """A start time for every on-screen word, including ones never matched."""
    times: list[float | None] = [
        words[alignment.mapping[i]].start if i in alignment.mapping else None
        for i in range(len(quote))
    ]
    known = [i for i, t in enumerate(times) if t is not None]
    i = 0
    while i < len(times):
        if times[i] is not None:
            i += 1
            continue
        # A run of words the transcriber dropped. They were said straight
        # after the last word it did hear, not spread across the pause that
        # follows, so pack them in behind that word.
        j = i
        while j < len(times) and times[j] is None:
            j += 1
        before = max((k for k in known if k < i), default=None)
        after = min((k for k in known if k > i), default=None)
        if before is not None:
            begin = words[alignment.mapping[before]].end
            limit = times[after] if after is not None else begin + 0.4 * (j - i)
            step = min(0.4, max(0.0, limit - begin) / (j - i + 1))
            for k in range(i, j):
                times[k] = begin + step * (k - i) + 0.03
        else:
            for k in range(i, j):
                times[k] = max(0.0, times[after] - 0.3 * (after - k))
        i = j
    out: list[float] = []
    for t in times:
        out.append(max(float(t or 0.0), out[-1] if out else 0.0))
    return out


# --- word boundaries ---------------------------------------------------------
# The transcriber is reliable about *which* words were said and roughly when,
# but it folds a pause into the word next to it: after a three-second silence
# the next word is reported as starting when the silence did, or some way into
# it. For a slow, deliberate speaker that is most words. So wherever a word is
# implausibly long, or is reported as starting where there is no sound, look at
# the audio itself and move the boundary to where the sound is.


def plausible_length(word: Word) -> float:
    return 0.4 + 0.085 * len(word.norm)


def loudness_envelope(wav: Path, hop_s: float):
    import numpy as np

    with wave.open(str(wav), "rb") as f:
        rate = f.getframerate()
        samples = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32)
    hop = int(rate * hop_s)
    frames = samples[: len(samples) // hop * hop].reshape(-1, hop)
    return np.sqrt((frames**2).mean(axis=1))


def snap_to_sound(words: list[Word], wav: Path, hop_s: float = 0.01) -> list[Word]:
    import numpy as np

    env = loudness_envelope(wav, hop_s)
    if len(env) == 0:
        return words
    floor, peak = np.percentile(env, 15), np.percentile(env, 95)
    loud = env > floor + 0.2 * (peak - floor)
    bridge = int(0.12 / hop_s)  # a gap this short is inside a word, not between two

    out: list[Word] = []
    for n, word in enumerate(words):
        limit = plausible_length(word)
        if word.start < 0 or word.end > len(env) * hop_s:
            out.append(word)
            continue
        lo, hi = int(word.start / hop_s), min(len(loud), int(word.end / hop_s))
        # How far past its reported end a word may really begin: a little
        # beyond where the next word is reported (that one may have been
        # pulled early by the same pause), and never more than a second.
        following = words[n + 1].start if n + 1 < len(words) else word.end + 1.0
        reach = min(len(loud), int((max(word.end, min(following, word.end + 1.0)) + 0.3) / hop_s))

        def onset_from(k: int) -> float | None:
            found = next(
                (i for i in range(max(0, k), reach) if loud[i] and loud[i : i + 5].sum() >= 3),
                None,
            )
            return None if found is None else found * hop_s

        length = word.end - word.start
        if length > limit:
            # Too long to be one word: a pause has been folded in. Find the
            # last stretch of sound inside the span and call that the word.
            j = hi - 1
            while j > lo and not loud[j]:  # skip silence after the word
                j -= 1
            stop = j
            gap = 0
            while j > lo and gap <= bridge:  # walk back through the word itself
                gap = 0 if loud[j] else gap + 1
                j -= 1
            begin = j + gap + 1 if gap > bridge else lo
            start, end = begin * hop_s, (stop + 1) * hop_s
            if end - start < 0.08:
                # The whole span is quiet, so the word is said as it closes.
                onset = onset_from(hi - 6)
                start = word.end - limit if onset is None else onset
                end = max(word.end, start + limit)
            elif end - start > 2.5 * limit:
                # Sound all the way through (a noisy crowd, say), so no edge
                # to find. Assume the word sits at the end of its span.
                start, end = word.end - limit, word.end
            start = max(word.start, start)
            out.append(replace(word, start=start, end=max(end, start + 0.08)))
            continue

        if loud[lo : lo + 3].any():
            out.append(word)
            continue
        # A plausible length, but it is reported as starting in silence: the
        # pause before it has pulled the whole word early. Move it to where
        # the sound actually picks up.
        start = onset_from(lo)
        if start is None:
            out.append(word)
            continue
        out.append(replace(word, start=start, end=max(word.end, start + length)))
    return out


# --- encoding ----------------------------------------------------------------


def extract_window(ffmpeg: str, media: Path, start: float, length: float, out: Path) -> None:
    run([
        ffmpeg, "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(media),
        "-vn", "-ac", "1", "-ar", "16000", str(out),
    ])


def measure_loudness(ffmpeg: str, media: Path, start: float, length: float) -> dict | None:
    result = run([
        ffmpeg, "-hide_banner", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(media),
        "-vn", "-af", f"loudnorm={LOUDNESS}:print_format=json", "-f", "null", "-",
    ])
    found = re.findall(r"\{[^{}]*\}", result.stderr, re.S)
    if not found:
        return None
    try:
        stats = json.loads(found[-1])
        float(stats["input_i"])
    except (ValueError, KeyError):
        return None
    return None if "inf" in json.dumps(stats) else stats


def encode(
    ffmpeg: str,
    media: Path,
    start: float,
    length: float,
    out: Path,
    picture: bool,
    fades: tuple[float, float],
) -> float | None:
    fade_in, fade_out = fades
    stats = measure_loudness(ffmpeg, media, start, length)
    loudnorm = f"loudnorm={LOUDNESS}"
    if stats:
        loudnorm += (
            f":measured_I={stats['input_i']}:measured_TP={stats['input_tp']}"
            f":measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}"
            f":offset={stats['target_offset']}:linear=true"
        )
    audio = (
        f"{loudnorm},afade=t=in:d={fade_in:.3f},"
        f"afade=t=out:st={max(0.0, length - fade_out):.3f}:d={fade_out:.3f}"
    )
    video = (
        ["-vf", "scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "26"]
        if picture
        else ["-vn"]
    )
    result = run([
        ffmpeg, "-y", "-hide_banner",
        "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(media),
        *video,
        "-af", audio,
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-movflags", "+faststart",
        str(out),
    ])
    if result.returncode != 0 or not out.exists():
        print(f"    encode failed: {result.stderr.strip()[-400:]}")
        return None
    return probe_duration(ffmpeg, out)


def probe_duration(ffmpeg: str, media: Path) -> float | None:
    found = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", run([ffmpeg, "-i", str(media)]).stderr)
    if not found:
        return None
    h, m, s = found.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


# --- one voice ---------------------------------------------------------------


def build_voice(
    voice_id: str, quote: str, entry: dict, cache: Path, ffmpeg: str, model: str
) -> dict | None:
    sources: list[str] = entry["sources"]
    picture: bool = entry.get("picture", True)
    tokens = [normalise(w) for w in quote.split()]

    for source in sources:
        print(f"  source: {source}")
        media = fetch(source, cache, ffmpeg)
        if media is None:
            continue
        words = transcribe(media, cache, model)
        found = align(tokens, words)
        if found is None or found.score < MIN_SCORE:
            print(f"    quote not found here (best score {found.score:.2f})" if found else "    no match")
            continue

        # Second pass over just that stretch. Timestamps from a long file drift
        # by a few hundred milliseconds; from a short window they are tight.
        pad = 4.0
        offset = max(0.0, words[found.first].start - pad)
        win_len = words[found.last].end + pad - offset
        window = cache / f"{voice_id}.window.wav"
        extract_window(ffmpeg, media, offset, win_len, window)
        win_words = transcribe(window, cache, model, tag=f".{offset:.2f}-{win_len:.2f}")
        refined = align(tokens, win_words)
        if refined is not None and refined.score >= found.score - 0.05:
            use = refined
        else:
            # Keep the first reading, shifted onto the window's clock.
            win_words = [replace(w, start=w.start - offset, end=w.end - offset) for w in words]
            use = found
        use_words = snap_to_sound(win_words, window)

        times = word_times(tokens, use_words, use)
        spoken_start = offset + times[0]
        spoken_end = offset + use_words[use.last].end
        # Take the usual room either side, but never so much that the clip
        # opens on the end of the previous sentence or closes on the start of
        # the next. A speaker who runs straight on gets a tighter cut.
        lead, tail = LEAD_S, TAIL_S
        if use.first > 0:
            lead = min(lead, max(MIN_LEAD_S, times[0] - use_words[use.first - 1].end - 0.03))
        if use.last + 1 < len(use_words):
            gap = use_words[use.last + 1].start - use_words[use.last].end
            tail = min(tail, max(MIN_TAIL_S, gap - 0.03))
        clip_start = max(0.0, spoken_start - lead)
        clip_len = spoken_end + tail - clip_start
        fades = (min(FADE_IN_S, lead * 0.7), min(FADE_OUT_S, tail))

        out = OUT_DIR / f"{voice_id}.{'mp4' if picture else 'm4a'}"
        duration = encode(ffmpeg, media, clip_start, clip_len, out, picture, fades)
        if duration is None:
            continue
        # Do not leave the other flavour behind from an earlier build.
        out.with_suffix(".m4a" if picture else ".mp4").unlink(missing_ok=True)

        heard = " ".join(w.text for w in use_words[use.first : use.last + 1])
        print(f"    match {use.score:.2f}  cue {clip_start:.2f}s  clip {duration:.2f}s"
              f"  ({out.stat().st_size / 1e6:.1f} MB)")
        if use.score < 1 or (use.last - use.first + 1) != len(tokens):
            print(f"    NOTE the transcript differs from the quote. Heard:\n      {heard}")
        return {
            "src": f"/voices/{out.name}",
            "duration": round(duration, 2),
            "picture": picture,
            "words": [round(offset + t - clip_start, 2) for t in times],
        }
    return None


def check_voice(voice_id: str, quote: str, clip: dict, cache: Path, ffmpeg: str, model: str) -> bool:
    """Listen to a finished clip from scratch and compare with its timings.

    The build measures the words inside a long recording and then cuts. This
    goes the other way — it transcribes the file the reel will actually play —
    so it catches a cut that landed in the wrong place or clipped a word.
    """
    path = FRONTEND / "public" / clip["src"].lstrip("/")
    if not path.exists():
        print(f"  {voice_id}: MISSING {path.name}")
        return False
    wav = cache / f"{voice_id}.check.wav"
    extract_window(ffmpeg, path, 0.0, clip["duration"], wav)
    words = snap_to_sound(transcribe(wav, cache, model, tag=f".{path.stat().st_mtime_ns}"), wav)
    tokens = [normalise(w) for w in quote.split()]
    found = align(tokens, words)
    if found is None or len(tokens) != len(clip["words"]):
        print(f"  {voice_id}: FAILED, the quote and the clip no longer match; rebuild it")
        return False
    shown = quote.split()
    drift = sorted(
        (abs(a - b), shown[i])
        for i, (a, b) in enumerate(zip(word_times(tokens, words, found), clip["words"]))
    )
    worst, worst_word = drift[-1]
    room = clip["duration"] - words[found.last].end
    # Two passes of the transcriber can disagree about a single word by half a
    # second without either cut being wrong, so only a larger miss, or a
    # general drift, counts as a problem.
    typical = drift[len(drift) // 2][0]
    ok = found.score >= MIN_SCORE and typical <= 0.15 and worst <= 1.0 and room >= 0.3
    print(
        f"  {voice_id}: {'ok' if ok else 'CHECK'}  quote heard {found.score:.0%}"
        f"  word timing off by {typical:.2f}s typically,"
        f" {worst:.2f}s at worst (\"{worst_word}\")"
        f"  first word at {words[found.first].start:.2f}s, {room:.2f}s after the last"
    )
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--only", help="comma-separated voice ids")
    parser.add_argument(
        "--check",
        action="store_true",
        help="build nothing; re-transcribe the finished clips and compare with their timings",
    )
    parser.add_argument("--model", default="small", help="faster-whisper model size")
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "cadence-voices",
        help="where downloads and transcripts are kept (outside the repo)",
    )
    args = parser.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[union-attr]

    args.cache.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_exe(args.cache)
    quotes = read_quotes()
    manifest: dict[str, dict] = json.loads(MANIFEST.read_text(encoding="utf-8"))
    clips: dict[str, dict] = (
        json.loads(OUT_JSON.read_text(encoding="utf-8")) if OUT_JSON.exists() else {}
    )

    wanted = args.only.split(",") if args.only else list(manifest)
    if args.check:
        results = [
            voice_id in quotes
            and voice_id in clips
            and check_voice(voice_id, quotes[voice_id], clips[voice_id], args.cache, ffmpeg, args.model)
            for voice_id in wanted
        ]
        return 0 if all(results) else 1

    failed: list[str] = []
    for voice_id in wanted:
        print(f"{voice_id}")
        if voice_id not in quotes or voice_id not in manifest:
            print("  skipped: needs an entry in both voices.ts and voices.sources.json")
            failed.append(voice_id)
            continue
        clip = build_voice(voice_id, quotes[voice_id], manifest[voice_id], args.cache, ffmpeg, args.model)
        if clip is None:
            print("  FAILED: no source yielded the quote")
            failed.append(voice_id)
            continue
        clips[voice_id] = clip
        # Written after every voice so a failure late in the run keeps the rest.
        # The timings go on one line each: thirty numbers down the page would
        # bury the three fields a person might actually want to read.
        text = re.sub(
            r"\[[\d.,\s]+\]",
            lambda m: "[" + ", ".join(n.strip() for n in m[0][1:-1].split(",")) + "]",
            json.dumps(clips, indent=2),
        )
        OUT_JSON.write_text(text + "\n", encoding="utf-8", newline="\n")

    print(f"\n{len(wanted) - len(failed)} of {len(wanted)} built" + (f"; failed: {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
