"""faster-whisper transcription with word timestamps.

The model is loaded ONCE, lazily, via lru_cache — never per request and never
in AppConfig.ready() (which would also fire on migrate/seed and waste 30s+).
`int8` compute on CPU is markedly faster. Heavy imports live inside the
functions so importing this module (e.g. at Django startup or in tests) is cheap.
"""

from functools import lru_cache


@lru_cache(maxsize=1)
def get_model():
    """Return the shared WhisperModel, loading it on first use."""
    from django.conf import settings
    from faster_whisper import WhisperModel

    return WhisperModel(settings.WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe(audio_path: str) -> dict:
    """Transcribe an audio file to text plus per-word timestamps.

    Returns {"transcript": str, "words": [{"word","start","end"}], "word_count": int}.
    English-only (scope). Silence yields an empty transcript rather than an error.
    """
    segments, _info = get_model().transcribe(
        audio_path,
        language="en",
        word_timestamps=True,
        vad_filter=False,
    )

    words: list[dict] = []
    for segment in segments:
        for w in segment.words or []:
            words.append({"word": w.word, "start": float(w.start), "end": float(w.end)})

    transcript = "".join(w["word"] for w in words).strip()
    return {"transcript": transcript, "words": words, "word_count": len(words)}
