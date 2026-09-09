// The Hall of Voices — the reel that plays when you sign in.
//
// This is the one file to edit to change what people see. Each entry pairs a
// line from a speech with a *craft note* written in Cadence's own vocabulary
// (pace, pauses, fillers, staying on topic), so the intro teaches something
// instead of only inspiring.
//
// ---------------------------------------------------------------------------
// ABOUT THE FOOTAGE
// ---------------------------------------------------------------------------
// Each voice can be backed by archive footage, in this order of preference:
//
//   1. `videoSrc`  — a file you drop in frontend/public/voices/ (see the README
//                    there). Fully self-hosted: no third party, no tracking,
//                    works offline. Best experience if you have the rights.
//   2. `youtubeId` — embedded through youtube-nocookie.com.
//   3. Nothing     — the generated cinematic backdrop in VoiceBackdrop.tsx.
//                    This is a designed fallback, not a placeholder; the reel
//                    is meant to look finished with no media at all.
//
// The six ids below were re-checked on 2026-09-09: all six resolve, carry the
// speech they claim, and report `playableInEmbed: true`. That can change at any
// time — third-party uploads get taken down, go private, or block embedding,
// and availability varies by country. Nothing breaks when one dies: the player
// reports it (or the start watchdog notices it never played) and the slide
// falls back to (3).
//
// ---------------------------------------------------------------------------
// WHY `soundSafe` EXISTS
// ---------------------------------------------------------------------------
// A slide shows one specific sentence. The clip behind it is a whole speech.
// Playing a 13-minute address from 0:00 while the screen quotes its closing
// line means the words you read and the words you hear are different sentences
// — which reads as broken, not cinematic. `startSeconds` alone cannot fix that,
// because a cue point nobody has watched is a guess.
//
// So sound is opt-in per clip:
//
//   soundSafe: true   The clip is cut so tightly around the quote that what you
//                     hear matches what you read. The reel offers "turn on
//                     sound" on that slide.
//   soundSafe: false  The cue point has not been verified against the quote.
//                     The clip still plays as silent wallpaper — you see the
//                     right speaker — but the reel will not offer sound for it.
//                     Hearing the wrong sentence is worse than hearing none.
//
// To promote a slide to `soundSafe: true`: play the clip, note the second the
// quoted line begins, set `startSeconds` to a beat or two before it, and flip
// the flag. That is the whole procedure.
//
// `startSeconds` on a `soundSafe: false` clip is a *framing* choice only — it
// picks a moment where the camera is on the speaker mid-delivery rather than on
// an introduction or a title card. It claims no sync.

export interface CraftNote {
  /** The rhetorical device, named. */
  technique: string
  /** What a speaker practising today can steal from it. */
  note: string
}

export interface Voice {
  id: string
  speaker: string
  /** Shown large. Keep it to roughly 30 words — it is set at display size. */
  quote: string
  occasion: string
  place: string
  year: number
  craft: CraftNote
  /** Duotone wash for the backdrop and the accent rules. */
  accent: string
  initials: string
  youtubeId: string | null
  /** Where to cue the clip. A sync point when `soundSafe`, otherwise framing. */
  startSeconds?: number
  /** True only when the audio at `startSeconds` matches the quote on screen.
   *  See the note at the top of this file — this gates the sound control. */
  soundSafe?: boolean
  videoSrc?: string | null
}

/** Set to false for a pure-typography reel with no third-party embeds. */
export const USE_ARCHIVE_FOOTAGE = true

/** How long each slide holds before advancing, in milliseconds. */
export const SLIDE_DURATION_MS = 9000

export const VOICES: Voice[] = [
  {
    id: 'king',
    speaker: 'Martin Luther King Jr.',
    quote:
      'I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character.',
    occasion: 'The March on Washington',
    place: 'Lincoln Memorial, Washington D.C.',
    year: 1963,
    craft: {
      technique: 'Anaphora',
      note: 'He begins line after line the same way. Repetition gives a room something to hold on to — and gives you somewhere to breathe.',
    },
    accent: '#f59e0b',
    initials: 'MLK',
    // 6:46 cut of the March on Washington address (verified 2026-09-09).
    // Framing only: the "four little children" line's offset is unmeasured.
    youtubeId: 'vP4iY1TtS3s',
    startSeconds: 60,
    soundSafe: false,
  },
  {
    id: 'obama',
    speaker: 'Barack Obama',
    quote: 'We are the ones we have been waiting for. We are the change that we seek.',
    occasion: 'Primary night address ("Yes We Can")',
    place: 'Nashua, New Hampshire',
    year: 2008,
    craft: {
      technique: 'The held pause',
      note: 'He stops dead before the line that matters and lets the silence do the work. A pause in the right place reads as control, never as hesitation.',
    },
    accent: '#06b6d4',
    initials: 'BO',
    // The full 13:09 "Yes We Can" speech (verified 2026-09-09). The quoted
    // line lands in the closing peroration; this offset is framing, not sync.
    youtubeId: 'Fe751kMBwms',
    startSeconds: 540,
    soundSafe: false,
  },
  {
    id: 'mandela',
    speaker: 'Nelson Mandela',
    quote:
      'I have cherished the ideal of a democratic and free society in which all persons live together in harmony and with equal opportunities. It is an ideal for which I am prepared to die.',
    occasion: 'Statement from the dock, Rivonia Trial',
    place: 'Pretoria, South Africa',
    year: 1964,
    craft: {
      technique: 'Plain words, total conviction',
      note: 'Not one ornament in it. When you mean every syllable you can afford to speak slowly, and slow is what conviction sounds like.',
    },
    accent: '#10b981',
    initials: 'NM',
    // 1:47 extract cut around "I am prepared to die" (verified 2026-09-09) —
    // the clip is the quoted passage, so its audio matches the slide.
    youtubeId: '0KhVzjcb5fI',
    startSeconds: 0,
    soundSafe: true,
  },
  {
    id: 'maathai',
    speaker: 'Wangari Maathai',
    quote:
      'In the course of history, there comes a time when humanity is called to shift to a new level of consciousness, to reach a higher moral ground.',
    occasion: 'Nobel Peace Prize lecture',
    place: 'Oslo, Norway',
    year: 2004,
    craft: {
      technique: 'The small, concrete image',
      note: 'She made a vast cause graspable with one hummingbird carrying one drop of water. Abstractions are forgettable; pictures are not.',
    },
    accent: '#7a50ff',
    initials: 'WM',
    // 9:03 excerpt of the Nobel lecture (verified 2026-09-09). Framing only:
    // the offset of the quoted sentence is unmeasured.
    youtubeId: 'dZap_QlwlKw',
    startSeconds: 120,
    soundSafe: false,
  },
  {
    id: 'malala',
    speaker: 'Malala Yousafzai',
    quote: 'One child, one teacher, one book and one pen can change the world.',
    occasion: 'Address to the United Nations Youth Assembly',
    place: 'New York City',
    year: 2013,
    craft: {
      technique: 'The stacking list',
      note: 'Four small things, named one at a time, adding up to something enormous. Short items land harder when you let each one finish.',
    },
    accent: '#ec4899',
    initials: 'MY',
    // 2:14 clip titled with this exact line (verified 2026-09-09) — the whole
    // clip is the quoted passage, so its audio matches the slide.
    youtubeId: 'Eme25t1Add0',
    startSeconds: 0,
    soundSafe: true,
  },
  {
    id: 'churchill',
    speaker: 'Winston Churchill',
    quote:
      'We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets. We shall never surrender.',
    occasion: 'Address to the House of Commons',
    place: 'London, United Kingdom',
    year: 1940,
    craft: {
      technique: 'Rhythm, and the short word last',
      note: 'Four beats a clause, hammered. He saves the shortest, oldest words for the end of the sentence, where they hit hardest.',
    },
    accent: '#ff5630',
    initials: 'WC',
    // 2:24 clip of the peroration (verified 2026-09-09) — the clip is the
    // quoted passage. Note the circulating audio is Churchill's own post-war
    // re-recording; the 1940 Commons delivery was never recorded.
    youtubeId: 'MkTw3_PmKtc',
    startSeconds: 0,
    soundSafe: true,
  },
]

/** Not in the reel by default — swap any of these in above to re-cast it. */
export const RESERVE_VOICES: Voice[] = [
  {
    id: 'angelou',
    speaker: 'Maya Angelou',
    quote: 'You may trod me in the very dirt, but still, like dust, I will rise.',
    occasion: '"Still I Rise"',
    place: 'United States',
    year: 1978,
    craft: {
      technique: 'Metre',
      note: 'A poet reading aloud keeps a beat. Deliberate rhythm is why some speakers sound composed and others sound rushed.',
    },
    accent: '#a855f7',
    initials: 'MA',
    youtubeId: null,
    soundSafe: false,
  },
  {
    id: 'kennedy',
    speaker: 'John F. Kennedy',
    quote:
      'Ask not what your country can do for you — ask what you can do for your country.',
    occasion: 'Inaugural address',
    place: 'Washington D.C.',
    year: 1961,
    craft: {
      technique: 'Chiasmus',
      note: 'The same words, turned around. Symmetry makes a sentence quotable before anyone decides whether they agree with it.',
    },
    accent: '#0ea5e9',
    initials: 'JFK',
    youtubeId: null,
    soundSafe: false,
  },
  {
    id: 'truth',
    speaker: 'Sojourner Truth',
    quote: "And ain't I a woman?",
    occasion: "Women's Convention",
    place: 'Akron, Ohio',
    year: 1851,
    craft: {
      technique: 'The rhetorical question',
      note: 'She asks, then waits. A question hands the room the work of answering, and they remember what they concluded themselves.',
    },
    accent: '#f43f5e',
    initials: 'ST',
    youtubeId: null,
    soundSafe: false,
  },
]
