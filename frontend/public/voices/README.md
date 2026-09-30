# Clips for the sign-in reel

The `/welcome` reel plays one short clip per voice: the speaker delivering the
line that is on screen. The clips in this folder are generated. You do not cut
or time them by hand.

## How it works

Each slide is timed by its clip. The slide starts when the clip starts, each
word lights at the moment it is spoken, and the reel moves on when the clip
ends. So the words you read and the words you hear are the same sentence, at
the same time, and the sound control is there from the first slide.

Two files drive that, and both are written by the builder:

| File | What it is |
| --- | --- |
| `public/voices/<id>.mp4` | The clip, trimmed to the quote. `<id>.m4a` when it is sound only. |
| `src/data/voiceClips.json` | For each voice: the clip's path, its length, and the second at which each word of the quote is spoken. |

## Building the clips

From `frontend/`:

```sh
uv run tools/build_voices.py              # every voice
uv run tools/build_voices.py --only king  # just one
uv run tools/build_voices.py --check      # verify the finished clips
```

It needs [uv](https://docs.astral.sh/uv/) and nothing else; ffmpeg, yt-dlp and
the transcription model are fetched on first run. For each voice the builder:

1. takes the `quote` from `src/data/voices.ts`,
2. fetches the first source listed for that voice in `tools/voices.sources.json`,
3. transcribes it to find exactly where the quote is spoken,
4. trims a clip around it and evens out the loudness, and
5. records when each word is said.

Downloads and transcripts are cached in your temp folder, so running it again
after a small change takes seconds. The first transcription of a long recording
is slow, roughly as long as the recording itself.

`--check` builds nothing. It transcribes each finished clip from scratch and
compares what it hears with the recorded timings, so it catches a cut that
landed in the wrong place or clipped a word.

## Changing the reel

**A different line.** Edit the `quote` in `src/data/voices.ts` and re-run the
builder for that voice. The quote has to be what the speaker actually says, word
for word. If it is not, the builder prints what it heard; copy the wording from
there. Published transcripts often differ from the recording.

**A different recording.** Edit the voice's `sources` in
`tools/voices.sources.json`. A source is a URL or a path to a file on disk.
Several can be listed; the first one that contains the quote wins.

**Sound only.** Add `"picture": false` to a voice in `tools/voices.sources.json`
when the recording's video is a slideshow rather than film of the speech (no
film exists of Mandela at the Rivonia trial, or of Churchill in the Commons).
The slide then keeps its generated backdrop and plays the audio over it.

**A new voice.** Add it to `VOICES` in `src/data/voices.ts`, add its sources to
`tools/voices.sources.json`, and run the builder.

## When a clip is missing

Nothing breaks. A voice with no clip, or whose file fails to load, runs on a
timer over the generated backdrop (`components/welcome/VoiceBackdrop.tsx`), and
the sound control says there is no sound for that slide. Setting
`USE_ARCHIVE_FOOTAGE = false` in `src/data/voices.ts` turns every slide into
that typography-only version.

## Before you ship this publicly

These are real speeches, and most recordings of them are somebody's copyright.
It varies a lot: US federal government works are generally public domain,
whereas the King estate actively licenses "I Have a Dream" and most news
footage is owned by the broadcaster. Hosting a clip yourself means you are the
one distributing it. If this app is going somewhere public, either clear the
clips, swap in recordings that are public domain or licensed, or set
`USE_ARCHIVE_FOOTAGE = false`. Short quotations with attribution, which is what
the on-screen text is, sit on much safer ground than redistributing audio and
video.
