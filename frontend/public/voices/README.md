# Archive footage for the sign-in reel

Drop video files in this folder to back the `/welcome` reel with footage you
host yourself, instead of a third-party embed.

## How to use

1. Put a file here, e.g. `king-1963.mp4`.
2. Point the matching entry in `src/data/voices.ts` at it:

   ```ts
   {
     id: 'king',
     videoSrc: '/voices/king-1963.mp4',
     startSeconds: 672,   // jump to the moment worth watching
     ...
   }
   ```

`videoSrc` wins over `youtubeId`. Anything in `public/` is served from the site
root, so the leading `/voices/...` is correct — do not write `public/` in the path.

## What plays, in order of preference

| Priority | Source | Notes |
| --- | --- | --- |
| 1 | `videoSrc` | Self-hosted. No third party, no tracking, works offline. |
| 2 | `youtubeId` | Embedded via `youtube-nocookie.com`. |
| 3 | *(nothing)* | The generated backdrop in `components/welcome/VoiceBackdrop.tsx`. |

The third row is a designed fallback, not a broken state — the reel is built to
look finished with no media in this folder at all. If a YouTube embed is removed,
made private, blocked in your country, or has embedding disabled, the player
reports the error and that slide falls back to the generated backdrop on its own.
Some of those failures are silent — a blocked clip can sit on "unstarted"
forever without raising an error — so the reel also gives every clip five
seconds to reach *playing* and drops it if it does not. Footage is never
revealed until it is confirmed playing, so a stalled clip shows the backdrop
rather than a black rectangle.

## Sound

Set `soundSafe: true` on a voice only when the audio at its `startSeconds`
actually carries the sentence printed on the slide. The reel offers its "turn on
sound" control only for those; everything else plays muted. Reading one sentence
while hearing another is the single worst thing this reel can do, so the flag
defaults to off and is meant to be earned by watching the clip once.

## Encoding

Web-friendly, small, and silent-safe:

```sh
ffmpeg -i source.mp4 -t 20 -vf "scale=1280:-2" -c:v libx264 -crf 24 \
       -preset slow -movflags +faststart -c:a aac -b:a 96k king-1963.mp4
```

Clips are played muted until the viewer turns sound on, so keep them short —
20–30 seconds is plenty for a slide that holds for nine.

## Before you ship this publicly

These are real speeches, and most footage of them is somebody's copyright. It
varies a lot: US federal government works are generally public domain, whereas
the King estate actively licenses "I Have a Dream" and most news footage is
owned by the broadcaster. Embedding via YouTube leans on the uploader's rights
rather than granting you any. If this app is going somewhere public, either
clear the clips, use footage that is genuinely public domain or licensed, or set
`USE_ARCHIVE_FOOTAGE = false` in `src/data/voices.ts` for the typography-only
reel. Short quotations with attribution — which is what the on-screen text is —
sit on much safer ground than redistributing video.
