# How Cadence Scores a Speech

A plain-language guide to every number on the Results screen: where each one
comes from, how the four parts become one final score, and what "cosine
similarity" means, including how the same idea runs through modern AI models
and LLMs.

> **Every number here is real.** The formulas are copied from
> [scoring.py](backend/coach/services/scoring.py) and
> [metrics.py](backend/coach/services/metrics.py). The settings come from
> [scoring.yaml](backend/coach/config/scoring.yaml). The worked examples were
> run through the actual scoring functions, and the similarity values were
> measured with the real MiniLM model on this laptop (17 November 2026).

---

## Contents

1. [The big picture in one minute](#1-the-big-picture-in-one-minute)
2. [Step zero: turning your voice into timed words](#2-step-zero-turning-your-voice-into-timed-words)
3. [The raw measurements, traced by hand](#3-the-raw-measurements-traced-by-hand)
4. [Pace score](#4-pace-score)
5. [Filler score](#5-filler-score)
6. [Pause score](#6-pause-score)
7. [Relevance score and cosine similarity](#7-relevance-score-and-cosine-similarity)
8. [How AI models learn "meaning as direction"](#8-how-ai-models-learn-meaning-as-direction)
9. [The same idea inside LLMs](#9-the-same-idea-inside-llms)
10. [The final score](#10-the-final-score)
11. [Two complete worked examples](#11-two-complete-worked-examples)
12. [Quirks and limits worth knowing](#12-quirks-and-limits-worth-knowing)
13. [One-page cheat sheet](#13-one-page-cheat-sheet)
14. [Questions you may be asked](#14-questions-you-may-be-asked)

---

## 1. The big picture in one minute

Think of Cadence as a **judge with four scorecards**. Each card gives a mark
out of 100 for one thing. The final score is a **weighted average** of the four
cards. Some cards count more than others.

```
                 YOUR RECORDING
                       │
                       ▼
          ┌─────────────────────────┐
          │  Whisper (speech → text) │   "So a good leader um listens..."
          │  + a timestamp per word  │   So 0.0–0.3s, a 0.4–0.5s, ...
          └────────────┬────────────┘
                       │
       ┌───────────────┼────────────────┬──────────────────┐
       ▼               ▼                ▼                  ▼
   ┌───────┐      ┌─────────┐      ┌─────────┐      ┌────────────┐
   │ PACE  │      │ FILLERS │      │ PAUSES  │      │ RELEVANCE  │
   │ words │      │ "um"s   │      │ gaps    │      │ meaning vs │
   │ / min │      │ / min   │      │ between │      │ the topic  │
   └───┬───┘      └────┬────┘      │ words   │      │ (MiniLM)   │
       │               │           └────┬────┘      └─────┬──────┘
       ▼               ▼                ▼                 ▼
    0–100           0–100            0–100             0–100
     × 25%           × 25%            × 15%             × 35%
       └───────────────┴────────┬───────┴─────────────────┘
                                ▼
                       FINAL SCORE (0–100)
```

Two kinds of thinking happen here, and keeping them apart is the heart of the
project:

| Job | Who does it | Can you check it by hand? |
|---|---|---|
| **Measuring**: what words were said, when, and what they mean | AI models (Whisper, MiniLM) | No. These are learned models. |
| **Judging**: turning measurements into marks | Simple written rules | **Yes.** Every rule is a line of arithmetic in `scoring.yaml`. |

AI is used only to **measure**. The **marking** is plain arithmetic anyone can
check. That's why the app can show you exactly why you got your score.

---

## 2. Step zero: turning your voice into timed words

Before any scoring, the recording goes to **Whisper**, an open-source
speech-recognition model from OpenAI, running locally on your CPU. It returns:

- the **transcript** (the words you said), and
- a **start and end time for every word**.

```
 word:     So    a    good   leader      um,    listens          carefully.
 time:  |0.0-0.3|0.4-0.5|0.6-0.9|1.0-1.5| ... |2.3-2.6|2.7-3.2| ......... |6.5-7.2|
                                  ▲                      ▲
                             0.8s gap               3.3s gap
```

Everything about **delivery** (pace, fillers, pauses) is computed from that
list of timed words. Nothing else about the audio is used. Cadence never
analyses pitch, volume or tone for the score. (The live audience *does* react
to volume while you speak, but that never affects the score.)

---

## 3. The raw measurements, traced by hand

Here's a tiny 8-second recording of 7 words. You can follow every step with
a calculator. These exact numbers were checked against the real
`compute_metrics` function.

| # | Word | Start | End |
|---|---|---|---|
| 1 | So | 0.0 | 0.3 |
| 2 | a | 0.4 | 0.5 |
| 3 | good | 0.6 | 0.9 |
| 4 | leader | 1.0 | 1.5 |
| 5 | um, | 2.3 | 2.6 |
| 6 | listens | 2.7 | 3.2 |
| 7 | carefully. | 6.5 | 7.2 |

The recording lasted **8.0 seconds** in total.

### 3.1 Speaking time

```
speaking time = end of last word − start of first word
              = 7.2 − 0.0
              = 7.2 seconds  (= 0.12 minutes)
```

Silence **before your first word** and **after your last word** is not counted.
Taking a breath before you start, or a moment to stop the recording, costs
nothing.

### 3.2 Words per minute (WPM)

```
WPM = number of words ÷ speaking minutes
    = 7 ÷ 0.12
    = 58.3 words per minute
```

### 3.3 The gaps between words

A gap is the silence between one word ending and the next one starting:

| Between | Calculation | Gap | Is it a pause? (≥ 0.5 s) | Is it a long pause? (≥ 3.0 s) |
|---|---|---|---|---|
| So → a | 0.4 − 0.3 | 0.1 s | no | no |
| a → good | 0.6 − 0.5 | 0.1 s | no | no |
| good → leader | 1.0 − 0.9 | 0.1 s | no | no |
| leader → um | 2.3 − 1.5 | **0.8 s** | **yes** | no |
| um → listens | 2.7 − 2.6 | 0.1 s | no | no |
| listens → carefully | 6.5 − 3.2 | **3.3 s** | **yes** | **yes** |

So: **2 pauses**, of which **1 is long**.

### 3.4 Silence ratio

```
silence ratio = total of all gaps ÷ full recording length
              = (0.1 + 0.1 + 0.1 + 0.8 + 0.1 + 3.3) ÷ 8.0
              = 4.5 ÷ 8.0
              = 0.5625   (56% of the recording was silence between words)
```

### 3.5 Fillers

Each word is lower-cased and stripped of punctuation ("um," → "um"), then
checked against the list in
[fillers.yaml](backend/coach/config/fillers.yaml). Here **"so"** and **"um"**
are both on the list:

```
filler count    = 2
fillers per min = 2 ÷ 0.12 = 16.7 per minute
```

### 3.6 Summary of the raw measurements

| Measurement | Value |
|---|---|
| Words | 7 |
| Speaking time | 7.2 s |
| WPM | 58.3 |
| Fillers | 2 (16.7 per minute) |
| Pauses (≥ 0.5 s) | 2 |
| Long pauses (≥ 3 s) | 1 |
| Silence ratio | 0.5625 |

These are **measurements, not marks**. The next four sections turn them into
marks out of 100.

---

## 4. Pace score

**Idea:** there's a comfortable speed for listeners. Inside that band you
get full marks. The further outside it you go, the more marks you lose, at a
steady rate.

| Setting | Value |
|---|---|
| Sweet spot | **120 to 150 WPM** |
| Marks lost per WPM outside the band | **1.5** |

### The rule

```
If 120 ≤ WPM ≤ 150:   pace score = 100
If WPM < 120:         pace score = 100 − 1.5 × (120 − WPM)
If WPM > 150:         pace score = 100 − 1.5 × (WPM − 150)
Never below 0, never above 100.
```

### What it looks like

```
score
 100 |              ●━━━━━━━━━━━━━●
     |            ╱                 ╲
  75 |          ╱                     ╲
     |        ╱                         ╲
  50 |      ╱                             ╲
     |    ╱                                 ╲
  25 |  ╱                                     ╲
     |╱                                         ╲
   0 +----+------+------+------+------+------+------+---- WPM
         53.3   90     120    150    180    200   216.7
                       └ sweet ┘
                         spot
```

It's a **flat-topped hill**. Too slow and too fast are punished equally.
You hit zero at 53.3 WPM (66.7 below the band) or 216.7 WPM (66.7 above it),
because 66.7 × 1.5 = 100.

### Real values from the code

| WPM | Distance outside band | Pace score |
|---|---|---|
| 90 | 30 below | 100 − 45 = **55.0** |
| 105 | 15 below | 100 − 22.5 = **77.5** |
| 120 | inside | **100** |
| 135 | inside | **100** |
| 150 | inside | **100** |
| 165 | 15 above | **77.5** |
| 180 | 30 above | **55.0** |
| 200 | 50 above | **25.0** |
| 220 | 70 above | 100 − 105 → clamped to **0** |

In the tiny example (58.3 WPM): `100 − 1.5 × (120 − 58.3) = 100 − 92.5 = 7.5`.

**Why 120 to 150?** It's a commonly cited comfortable range for
conversational and presentation speech: slow enough to follow, fast enough
to stay engaging. It's a **starting value** to be calibrated, not a law of
nature.

---

## 5. Filler score

**Idea:** a few filler words are human. Lots of them distract. Fillers are
counted **per minute**, so a long speech isn't punished just for being long.

| Setting | Value |
|---|---|
| Full marks at or below | **1 filler per minute** |
| Zero marks at or above | **8 fillers per minute** |

**The filler list** ([fillers.yaml](backend/coach/config/fillers.yaml)):

- **Single words:** um, uh, er, erm, ah, hmm, like, so, actually, basically,
  literally, honestly, right, well, okay
- **Phrases:** you know, I mean, sort of, kind of

### The rule

```
If fillers/min ≤ 1:   filler score = 100
If fillers/min ≥ 8:   filler score = 0
In between:           filler score = 100 × (8 − fillers/min) ÷ (8 − 1)
                                   = 100 × (8 − fillers/min) ÷ 7
```

In plain words, between 1 and 8 you lose about **14.3 marks for every extra
filler per minute** (100 ÷ 7).

### What it looks like

```
score
 100 |●━━━━●
     |      ╲
  75 |        ╲
     |          ╲
  50 |            ╲
     |              ╲
  25 |                ╲
     |                  ╲
   0 +----+----+----+----●━━━━━━━━━━━ fillers per minute
     0    1    3    5    8    10
```

### Real values from the code

| Fillers per minute | Calculation | Filler score |
|---|---|---|
| 0 | at or below 1 | **100** |
| 1 | at or below 1 | **100** |
| 2 | 100 × 6 ÷ 7 | **85.7** |
| 3 | 100 × 5 ÷ 7 | **71.4** |
| 4.76 | 100 × 3.24 ÷ 7 | **46.3** |
| 6 | 100 × 2 ÷ 7 | **28.6** |
| 8 or more | at or above 8 | **0** |

**Known weakness:** "like", "so", "well", "right" and "actually" are also real
words. "I *like* this idea" counts as a filler. The counter can't tell the
difference, because it only sees words, not intent. The list is in a config
file precisely so it can be tuned.

---

## 6. Pause score

**Idea:** pauses are good. They give listeners time to think. But long
silences ("dead air") lose the audience, and a speech with **no** pauses at
all is a breathless wall of words. So this score **starts at 100 and
subtracts penalties**.

| Penalty | When it applies | How much |
|---|---|---|
| Long pause | each gap of **3 seconds or more** | **−15** each |
| Too much silence | silence ratio above **0.35** (35%) | **−(ratio − 0.35) × 100** |
| No pauses at all | not a single gap of 0.5 s or more | **−10** |

### The rule

```
pause score = 100
            − 15 × (number of long pauses)
            − (silence ratio − 0.35) × 100      ← only if ratio > 0.35
            − 10                                ← only if there were zero pauses
Never below 0.
```

The silence penalty is gentle and gradual. Every 1% of silence above 35%
costs 1 mark.

### Real values from the code

| Pauses | Long pauses | Silence | Penalties | Pause score |
|---|---|---|---|---|
| 5 | 0 | 20% | none | **100** |
| 5 | 1 | 20% | −15 | **85** |
| 5 | 2 | 20% | −30 | **70** |
| 5 | 0 | 45% | −10 (45 − 35) | **90** |
| 0 | 0 | 0% | −10 (no pauses) | **90** |
| 4 | 3 | 50% | −45 −15 | **40** |

In the tiny example (1 long pause, silence 0.5625):

```
100 − 15 × 1 − (0.5625 − 0.35) × 100
= 100 − 15 − 21.25
= 63.75   → shown as 63.8
```

Notice that **a normal pause (0.5 to 3 s) never costs anything.** Only very
long ones do. Cadence wants you to pause.

---

## 7. Relevance score and cosine similarity

This is the most interesting part and carries the **most weight (35%)**. The
question is: *did your speech actually talk about the topic?*

Counting shared words won't work. "A good leader listens" and "the best
managers hear their teams out" share almost no words but mean nearly the same
thing. Cadence needs to compare **meaning**. To do that it uses a small AI
model called **all-MiniLM-L6-v2**, together with a simple piece of geometry
called **cosine similarity**.

### 7.1 Step one: turning text into a list of numbers (an "embedding")

MiniLM reads a piece of text and outputs a list of **384 numbers**. That list
is called an **embedding** or a **vector**. You can picture it as an arrow
pointing somewhere in a space with 384 directions.

The key property, learned during training (section 8), is:

> **Texts with similar meanings produce arrows that point in similar directions.**

An analogy: imagine every possible meaning has an address on a gigantic map.
"Leadership" lives in one neighbourhood, "cooking" in another, "football" in
another. MiniLM is a machine that reads any text and tells you its address.
Two texts about leadership get nearby addresses, even if they use different
words.

### 7.2 A toy example you can compute by hand

Real embeddings have 384 numbers, which is impossible to draw. So pretend
there are only **3 directions**, and pretend each one has a clear meaning:

| Direction | Means "this text is about..." |
|---|---|
| 1st number | leadership |
| 2nd number | teamwork |
| 3rd number | technology |

Now give each text an arrow:

| Text | Arrow |
|---|---|
| **Topic:** "What makes a good leader?" | **T = (3, 1, 0)** |
| Speech A: a long, on-topic answer | A = (6, 2, 0) |
| Speech B: mostly about teamwork | B = (2, 2, 0) |
| Speech C: a speech about technology | C = (0, 0, 5) |
| Speech D: a bit of leadership, mostly technology | D = (1, 0, 3) |

> **Honest caveat:** in a real model the 384 directions **don't** have neat
> human labels like "leadership". Meaning is spread across all of them in ways
> nobody designed. The labels here are only to build intuition. The maths is
> identical.

### 7.3 The formula

Cosine similarity measures **the angle between two arrows**:

```
                   A · B                 (multiply matching numbers, then add)
cos(angle) = ─────────────────
              |A| × |B|                 (the lengths of the two arrows)

where the length |A| = √(a₁² + a₂² + a₃² + ...)
```

- **Same direction** (angle 0°) → **1**
- **At right angles**, nothing in common (90°) → **0**
- **Opposite directions** (180°) → **−1**

### 7.4 Working it out: Topic vs Speech B

```
T = (3, 1, 0)        B = (2, 2, 0)

Step 1, the dot product (multiply pairs, add up):
   T · B = 3×2 + 1×2 + 0×0 = 6 + 2 + 0 = 8

Step 2, the lengths:
   |T| = √(3² + 1² + 0²) = √10 ≈ 3.162
   |B| = √(2² + 2² + 0²) = √8  ≈ 2.828

Step 3, divide:
   cosine = 8 ÷ (3.162 × 2.828) = 8 ÷ 8.944 ≈ 0.894
```

Speech B scores **0.894**: very similar to the topic, but not identical,
because it leans towards teamwork.

### 7.5 All four speeches

| Speech | Dot product with T | Lengths multiplied | Cosine | Angle | Meaning |
|---|---|---|---|---|---|
| A (6, 2, 0) | 18+2+0 = 20 | 3.162 × 6.325 = 20 | **1.000** | 0° | Exactly the topic's direction |
| B (2, 2, 0) | 6+2+0 = 8 | 3.162 × 2.828 = 8.944 | **0.894** | 27° | Close |
| D (1, 0, 3) | 3+0+0 = 3 | 3.162 × 3.162 = 10 | **0.300** | 73° | Only partly related |
| C (0, 0, 5) | 0+0+0 = 0 | 3.162 × 5 = 15.81 | **0.000** | 90° | Unrelated |

```
          teamwork ▲
                   │      B (2,2)
                   │     ╱
                   │    ╱   27°  ●  A (6,2)  ← same direction as T,
                   │   ╱    ╱╱╱╱╱               just a longer arrow
                   │  ╱ ╱╱╱╱  T (3,1)
                   │ ╱╱╱╱
                   └────────────────────────────▶ leadership
                  ╱
                 ╱
   technology   ▼  C (0,0,5)  ← points along a completely different axis: 90°
```

### 7.6 Why the angle and not the distance?

Look at Speech **A** = (6, 2, 0). Its arrow is **twice as long** as the
topic's arrow (3, 1, 0), but it points in **exactly the same direction**. Its
cosine is a perfect **1.0**.

That's what we want. Arrow length mostly reflects things like *how much*
text there is, while **direction reflects what it's about**. A one-minute
speech and a one-sentence topic are very different in size, but if they're
about the same thing they should point the same way. Cosine ignores length
and looks only at direction.

### 7.7 The shortcut Cadence uses: normalising

Cadence asks MiniLM to **normalise** every arrow, which means shrinking or
stretching it to length exactly **1** without changing its direction. When
both arrows have length 1, the bottom of the formula becomes `1 × 1 = 1`, so:

```
cosine = A · B        (just the dot product)
```

That's exactly what [relevance.py](backend/coach/services/relevance.py)
does:

```python
vecs = model.encode([transcript, topic_text], normalize_embeddings=True)
return float(np.dot(vecs[0], vecs[1]))      # dot product of unit vectors = cosine
```

The real version multiplies **384 pairs** of numbers and adds them up.
Same idea, more numbers.

### 7.8 Real similarity numbers from MiniLM on this laptop

The topic was **"What makes a good leader?"**:

| Speech (shortened) | Cosine | Relevance score |
|---|---|---|
| "A good leader listens before they speak. They set a clear direction, take responsibility... give credit to the team..." | **0.766** | **100** |
| "In my school I was the class prefect. Every morning I had to make sure the classroom was clean..." *(related, but indirect)* | **0.280** | **32.4** |
| "I believe that technology has changed the way we learn. Students can watch lectures online..." *(off topic)* | **0.022** | **0** |
| *(empty, no speech)* | **0.080** | **0** |
| "What makes a good leader? A good leader. Leaders, leadership, what makes a leader good." *(just echoing the topic)* | **0.793** | **100** |

Some other real pairs that show what the model "understands":

| Text 1 | Text 2 | Cosine |
|---|---|---|
| "The cat sat on the mat." | "A kitten was resting on the rug." | **0.625**: no shared words, same meaning |
| "The cat sat on the mat." | "Interest rates rose again this quarter." | **−0.032**: unrelated |
| "king" | "queen" | **0.681** |
| "king" | "banana" | **0.395** |

Three lessons from these numbers:

1. **It really compares meaning, not words.** The cat/kitten pair shares no
   words but scores 0.625.
2. **"Unrelated" is rarely exactly 0.** Even "king" and "banana" score 0.395,
   and an empty transcript scores 0.08. Real embeddings all live in a
   somewhat crowded region of the space. That's why Cadence treats anything
   at or below **0.15** as zero relevance (next section).
3. **It measures topic, not quality.** The echo speech beats the genuinely
   good answer (0.793 vs 0.766) just by repeating the topic's words. This is
   exactly why **own-topic takes only count towards the delivery levels**
   (section 12).

### 7.9 Step two: turning the cosine into a mark out of 100

A raw cosine like 0.43 is hard to read, so Cadence stretches the useful range
onto 0 to 100:

| Setting | Value | Meaning |
|---|---|---|
| Floor | **0.15** | at or below this → **0** |
| Ceiling | **0.55** | at or above this → **100** |

```
If cosine ≤ 0.15:   relevance score = 0
If cosine ≥ 0.55:   relevance score = 100
In between:         relevance score = 100 × (cosine − 0.15) ÷ (0.55 − 0.15)
                                    = 100 × (cosine − 0.15) ÷ 0.40
```

```
score
 100 |                    ●━━━━━━━━━━━━
     |                  ╱
  75 |                ╱
  50 |            ╱
  25 |        ╱
   0 |━━━━━━●
     +------+-----+-----+-----+-----+---- cosine similarity
     0    0.15  0.25  0.35  0.45  0.55  0.70
```

| Cosine | Calculation | Relevance score |
|---|---|---|
| 0.05 | at or below 0.15 | **0** |
| 0.15 | at or below 0.15 | **0** |
| 0.25 | 100 × 0.10 ÷ 0.40 | **25** |
| 0.35 | 100 × 0.20 ÷ 0.40 | **50** |
| 0.43 | 100 × 0.28 ÷ 0.40 | **70** |
| 0.45 | 100 × 0.30 ÷ 0.40 | **75** |
| 0.55 or more | at or above 0.55 | **100** |

**Why these bounds?** A one-sentence topic and a one-minute speech are very
different texts, so even a perfectly on-topic speech rarely reaches a cosine
of 0.9. The bounds are **starting values**. The **raw cosine is always
saved** with each session, so the bounds can be recalibrated later without
re-recording anything.

---

## 8. How AI models learn "meaning as direction"

How does MiniLM know that "kitten" and "cat" should point the same way?
Nobody told it. It **learned** it.

### 8.1 The core idea: you know a word by its company

There's an old idea in linguistics (J.R. Firth, 1957): *"You shall know a
word by the company it keeps."* Words that appear in similar surroundings
tend to mean similar things. "Coffee" and "tea" both appear near "cup",
"drink", "hot" and "morning". "Coffee" and "volcano" don't share company.

Early embedding models like **word2vec** (Google, 2013) turned this into
maths. Each word starts as a **random** arrow. The model reads billions of
sentences and nudges the arrows so that words appearing in similar contexts
drift towards each other. After enough reading, the space organises itself.
It even captures relationships, as in the famous example:

```
arrow("king") − arrow("man") + arrow("woman")  ≈  arrow("queen")
```

The *direction* from "man" to "woman" turns out to be roughly the same as the
direction from "king" to "queen". Nobody programmed that. It emerged from
reading.

### 8.2 From words to whole sentences: MiniLM

Cadence needs to compare a **whole speech** with a **whole topic**, not single
words. MiniLM is a **sentence embedding** model. Roughly, it works like this:

```
"A good leader listens"
        │
        ▼
1. Split into tokens:      [a] [good] [leader] [listens]
        │
        ▼
2. Look up a starting arrow for each token
        │
        ▼
3. Six "transformer" layers let each token look at the others
   and adjust its arrow in context
   ("leader" next to "good" is not the same as "leader" in "follow the leader")
        │
        ▼
4. Average all the token arrows into ONE arrow   (called "mean pooling")
        │
        ▼
5. Normalise to length 1
        │
        ▼
   384 numbers: [0.021, −0.113, 0.067, ...]
```

### 8.3 How it was trained: pull together, push apart

MiniLM was fine-tuned on a very large collection of **sentence pairs that
belong together** (over a billion, according to its model card): a question
and its answer, a title and its article, two descriptions of the same thing.
Training is a game of magnets:

```
  Pair that belongs together:            Random pair:
  "How do I boil an egg?"                "How do I boil an egg?"
  "Put the egg in boiling water          "The stock market fell 3%."
   for nine minutes."
         ──▶  ◀──                              ◀──      ──▶
    PULL their arrows together            PUSH their arrows apart
```

This is called **contrastive learning**. Each round, the model's internal
settings (about 22 million numbers called **parameters** or weights) are
nudged slightly so that matching pairs end up with a **higher cosine** and
non-matching pairs a **lower** one. After millions of rounds, the geometry
of the space reflects meaning.

> **Cosine similarity isn't just how Cadence *reads* the model. It's also
> what the model was *trained* to make meaningful.** Training literally
> optimised "related texts → high cosine".

### 8.4 About the name all-MiniLM-L6-v2

| Part | Meaning |
|---|---|
| **MiniLM** | A small model **distilled** from a larger one: a big "teacher" model trains a small "student" to imitate it |
| **L6** | **6** transformer layers (large models have dozens) |
| **384** | numbers in each output vector |
| **~22 million** | parameters: tiny by modern standards, which is why it runs fast on a laptop CPU |
| **all-** | trained on a broad mix of datasets, so it works on general text |

---

## 9. The same idea inside LLMs

Large Language Models such as Claude, GPT, Gemini and Llama are much bigger
and do a different job: they **generate** text rather than produce one
vector. But **"meaning as direction" and "similarity as a dot product" are at
the centre of how they work too.** Here are four places it appears.

### 9.1 Every token starts as an embedding

The very first thing an LLM does with your prompt is exactly what MiniLM
does: split it into tokens and look up an arrow for each one. In big models
each arrow has **thousands** of numbers instead of 384. Similar tokens have
arrows pointing in similar directions, learned in the same "company it keeps"
way.

### 9.2 Attention: "which words matter to me?" is a similarity question

The key ingredient of every modern LLM, the **transformer's attention**,
is built on dot products. For every token, the model makes:

- a **query** ("what am I looking for?"),
- a **key** ("what do I contain?"), and
- a **value** ("what do I pass on if chosen?").

To decide how much token X should pay attention to token Y, the model
computes **query(X) · key(Y)**, a dot product, which is the same operation at
the heart of cosine similarity:

```
Sentence: "The trophy didn't fit in the suitcase because IT was too big."

query("it") · key("trophy")    → HIGH   → "it" pays attention to "trophy"
query("it") · key("suitcase")  → lower
query("it") · key("the")       → low
```

The scores go through **softmax**, which turns them into percentages that
add up to 100%. The token then blends in information from the tokens it
attends to. One difference from Cadence: attention uses a **scaled dot
product** (divided by the square root of the vector size) rather than a fully
normalised cosine, so arrow length still matters a little. The core idea,
"how aligned are these two arrows?", is identical.

MiniLM's six layers use this same attention mechanism. It's what lets
"leader" in "good leader" get a different arrow from "leader" in "follow the
leader".

### 9.3 Choosing the next word is also a similarity contest

When an LLM writes, its final step produces one arrow meaning, roughly,
"what should come next". It then takes the **dot product of that arrow with
the embedding of every word in its vocabulary**. The words whose arrows are
most aligned get the highest scores, softmax turns the scores into
probabilities, and a word is picked.

```
"what comes next" arrow · arrow("Paris")   → very high
"what comes next" arrow · arrow("banana")  → very low
                         (prompt: "The capital of France is")
```

So every word an LLM writes is chosen by a **similarity contest** between
arrows.

### 9.4 Semantic search and RAG: exactly what Cadence does, at scale

When an AI assistant "searches your documents" (called **RAG**,
retrieval-augmented generation), it usually:

1. embeds every document chunk into a vector, ahead of time;
2. embeds your question;
3. finds the chunks with the **highest cosine similarity** to your question;
4. hands those chunks to the LLM to write an answer.

Cadence's relevance check is **step 3 with a single document**: the topic is
the "question", your speech is the "document", and the cosine says how well
they match. You're using the same building block that powers modern AI
search.

### 9.5 Then why not just ask an LLM to grade the speech?

| | MiniLM + cosine + rules (Cadence) | Ask an LLM "rate this speech" |
|---|---|---|
| Explainable | Yes: one number, one formula | No: a judgement you can't trace |
| Same input → same score | Always | Not guaranteed |
| Runs offline on a laptop | Yes (22M parameters) | Large models need a GPU or the cloud |
| Privacy | Voice never leaves the machine | Usually sent to a server |
| Cost | Free | Often paid per use |
| Testable by hand | Yes | No |

The project's principle is **AI to measure, rules to judge**, and this is
where that choice pays off.

---

## 10. The final score

### 10.1 The rule: a weighted average

Each of the four marks is multiplied by its **weight**, and the results are
added:

```
final score = 0.25 × pace
            + 0.25 × filler
            + 0.15 × pause
            + 0.35 × relevance
```

| Component | Weight | Most it can add to the final score |
|---|---|---|
| Pace | 25% | 25 points |
| Fillers | 25% | 25 points |
| Pauses | 15% | 15 points |
| Relevance | **35%** | **35 points** |
| **Total** | **100%** | **100 points** |

The weights add up to exactly 1 (100%), so the final score is always between
0 and 100.

### 10.2 The pizza analogy

Think of the final score as a **pizza cut into four unequal slices**:

```
            ┌───────────────┐
         ╱  │   RELEVANCE   │  ╲
       ╱    │      35%      │    ╲
      │─────┴───────┬───────┴─────│
      │    PACE     │   FILLERS   │
      │     25%     │     25%     │
       ╲            │            ╱
         ╲──────────┴──────────╱
              PAUSES  15%
```

Each component's mark says **how much of its own slice you get to eat**. A
pace mark of 80 means you eat 80% of the pace slice: 0.80 × 25 = 20 points.
Your final score is the total pizza you ate.

That's why the Results screen shows each component as **"+X / max"** (for
example `+19.4 / 25`): how much of that slice you earned.

### 10.3 Why these weights?

- **Relevance is highest (35%).** Staying on the assigned topic is the core
  skill of *impromptu* speaking, which is the focus of this project. Fluent
  speech that dodges the question isn't good impromptu speaking.
- **Pace and fillers (25% each).** These are the two delivery habits
  listeners notice most.
- **Pauses (15%).** Important, but the rule is mostly about avoiding
  extremes (dead air or no pauses), so it weighs less.

Like every number here, the weights live in `scoring.yaml` and can be changed
without touching code.

### 10.4 What the final number means

The Results screen describes the final score in bands:

| Final score | Label |
|---|---|
| 85 and above | **Excellent** |
| 70 to 84 | **Strong** |
| 55 to 69 | **Solid start** |
| 40 to 54 | **Getting there** |
| below 40 | **Keep building** |

### 10.5 A note on rounding

Every number is calculated at full precision. Only the **final displayed
values** are rounded to one decimal place. The overall score is computed from
the **unrounded** components, so adding up the rounded numbers on screen can
occasionally differ from the overall by 0.1.

---

## 11. Two complete worked examples

### Example 1: a typical take (verified: final score 73.7)

| Raw measurement | Value |
|---|---|
| WPM | 105 (a bit slow) |
| Fillers per minute | 3.0 |
| Long pauses | 1 |
| Silence ratio | 0.40 (40%) |
| Cosine similarity to the topic | 0.43 |

**Step 1: each component mark**

```
Pace:      105 is 15 below 120  →  100 − 1.5 × 15             = 77.5
Fillers:   3.0 per minute       →  100 × (8 − 3) ÷ 7          = 71.4
Pauses:    1 long, 40% silence  →  100 − 15 − (0.40−0.35)×100 = 80.0
Relevance: cosine 0.43          →  100 × (0.43 − 0.15) ÷ 0.40 = 70.0
```

**Step 2: weight them and add**

| Component | Mark | × Weight | = Points | Out of |
|---|---|---|---|---|
| Pace | 77.5 | × 0.25 | **19.4** | 25 |
| Fillers | 71.4 | × 0.25 | **17.9** | 25 |
| Pauses | 80.0 | × 0.15 | **12.0** | 15 |
| Relevance | 70.0 | × 0.35 | **24.5** | 35 |
| **Final** | | | **73.7** | 100 |

**Verdict: Strong.**

Where were the points lost? Pace lost 5.6, fillers 7.1, pauses 3.0 and
relevance 10.5. **Relevance cost the most.** Even a modest relevance gap is
expensive because of its 35% weight. The quickest improvement would be to
name the topic's key ideas early and keep returning to them.

### Example 2: a real take recorded on this laptop (final score 51.6)

During testing, a speech about **technology in education** was recorded
against the topic **"What makes a good leader?"**. The real result:

| Component | Raw measurement | Mark | Points |
|---|---|---|---|
| Pace | 131.7 WPM (inside 120 to 150) | **100** | 25.0 / 25 |
| Fillers | 3 fillers ("um", "like", "so") = 4.76 per minute | **46.3** | 11.6 / 25 |
| Pauses | 8 pauses, 0 long, 25% silence | **100** | 15.0 / 15 |
| Relevance | cosine **0.062**, below the 0.15 floor | **0** | 0.0 / 35 |
| **Final** | | | **51.6** |

The delivery was excellent: perfect pace and perfect pauses. But the speech
was **off topic**, so a full 35 points vanished. The coach wrote: *"Your
speech drifted from the topic. Name its key terms early and keep returning to
them."* This shows the scoring is doing its job: fluent speech that dodges
the question can't score highly.

### Example 3: the tiny 7-word take from section 3 (final score 33.3)

Assume its cosine with the topic was 0.40:

| Component | Mark | × Weight | Points |
|---|---|---|---|
| Pace (58.3 WPM) | 7.5 | × 0.25 | 1.9 |
| Fillers (16.7/min) | 0.0 | × 0.25 | 0.0 |
| Pauses (1 long, 56% silence) | 63.8 | × 0.15 | 9.6 |
| Relevance (0.40) | 62.5 | × 0.35 | 21.9 |
| **Final** | | | **33.3** → *Keep building* |

---

## 12. Quirks and limits worth knowing

Being upfront about these is stronger than being caught out by them.

**1. A silent take scores about 38.5, not 0.**
With no words at all: WPM is 0 so pace = 0, but there are **no fillers** so
filler = 100, and there are no pauses so pause = 100 − 10 = 90, while
relevance = 0. That gives `0.25×0 + 0.25×100 + 0.15×90 + 0.35×0 = 38.5`.
Each rule is reasonable on its own ("no fillers is good"), but together they
reward saying nothing. A possible fix is to refuse to score a take with no
words. The coach note does tell the speaker "We couldn't hear clear speech."

**2. Relevance measures topic, not quality.**
The real test above showed that repeating the topic's words (0.793) beats a
thoughtful answer (0.766). Cosine similarity asks "same subject?", not "good
argument?". Someone who writes their own topic could tune it to their speech.
So **own-topic takes count only towards the delivery levels**, the ones whose
rule ignores relevance:

| Level | Rule looks at | Own-topic takes count? |
|---|---|---|
| 1 The Novice | one take of 60 s or more | ✅ yes |
| 2 The Apprentice | overall score (contains relevance) | ❌ no |
| 3 The Speaker | pace in 120–150 WPM | ✅ yes |
| 4 The Communicator | fewer than 3 fillers a minute | ✅ yes |
| 5 The Persuader | relevance 80+ | ❌ no |
| 6 The Orator | overall 80+, every component 70+ | ❌ no |
| 7 The Master Orator | overall 85+ | ❌ no |

The baseline (your first score, used by Level 2) also comes only from a
random-topic take. In the tests, four excellent own-topic takes stop at
exactly Level 4, while the same takes on random topics reach Level 7.

**3. Long speeches get cut off for relevance.**
MiniLM reads at most about 256 tokens (roughly 190 to 200 words) and ignores
the rest. A one-minute speech fits; a three-minute one is judged only on its
opening. Cadence is designed for one-minute takes, so this rarely matters.

**4. Filler words that are also real words.**
"I *like* this" counts as a filler. The counter sees words, not intent.

**5. Everything depends on Whisper.**
If Whisper mishears a word, drops an "um" (speech recognisers often tidy
these up) or gets a timestamp slightly wrong, the measurements shift. Pace and
pauses rely on Whisper's word timings being accurate.

**6. The thresholds are starting points, not truths.**
120 to 150 WPM, 1 to 8 fillers per minute and 0.15 to 0.55 cosine are
reasonable defaults, not values validated against human judges. The project
stores every raw measurement so they can be **calibrated** later, for example
by asking real listeners to rate speeches and adjusting the numbers until
Cadence agrees with them.

---

## 13. One-page cheat sheet

```
──────────────────────────── MEASUREMENTS ────────────────────────────
speaking time  = last word end − first word start
WPM            = words ÷ speaking minutes
gap            = next word start − this word end
pause          = gap ≥ 0.5 s          long pause = gap ≥ 3.0 s
silence ratio  = sum of gaps ÷ full recording length
fillers/min    = filler words ÷ speaking minutes
cosine         = embedding(speech) · embedding(topic)   [both length 1]

──────────────────────────── COMPONENT MARKS (0–100) ─────────────────
PACE       120–150 → 100;  outside: 100 − 1.5 × (distance from band)
FILLERS    ≤1/min → 100;  ≥8/min → 0;  between: 100 × (8 − f) ÷ 7
PAUSES     100 − 15 per long pause
               − (silence − 0.35) × 100   if silence > 35%
               − 10                       if no pauses at all
RELEVANCE  cosine ≤0.15 → 0;  ≥0.55 → 100;  between: 100 × (c − 0.15) ÷ 0.40

──────────────────────────── FINAL SCORE ─────────────────────────────
FINAL = 0.25 × PACE + 0.25 × FILLERS + 0.15 × PAUSES + 0.35 × RELEVANCE

Bands: 85+ Excellent · 70+ Strong · 55+ Solid start · 40+ Getting there
       below 40 Keep building

All numbers live in backend/coach/config/scoring.yaml and fillers.yaml.
```

---

## 14. Questions you may be asked

**Q: In one sentence, what is cosine similarity?**
A: It measures how closely two arrows point in the same direction: 1 means the
same direction, 0 means unrelated, −1 means opposite. Because an AI model
turns text into arrows that point the same way when the meaning is the same,
it gives a number for "how similar in meaning are these two texts?".

**Q: Why cosine and not straight-line distance?**
A: Distance is affected by the arrows' lengths, which mostly reflect how much
text there is. A long speech and a short topic would look far apart even if
they're about the same thing. Cosine only looks at direction, which is where
the meaning is. Also, the model was trained to make cosine meaningful.

**Q: Where do the 384 numbers come from?**
A: From MiniLM, a small transformer model trained with contrastive learning
on a very large set of related sentence pairs. It learned to place related
texts close in direction. Nobody hand-designed the 384 dimensions, and they
don't have human-readable labels.

**Q: Is this how ChatGPT or Claude work?**
A: Partly. LLMs also turn every token into an embedding, and their attention
mechanism decides what to focus on using dot products between query and key
vectors, the same operation at the core of cosine similarity. Choosing each
next word is also a dot-product comparison against every word's embedding.
The difference is that an LLM generates text, while MiniLM only outputs one
vector to compare. Cadence's relevance check is the same building block
behind AI semantic search and RAG.

**Q: Why is relevance weighted highest?**
A: The project is about *impromptu* speaking, where the core skill is
answering the question you were given. Fluent speech that ignores the topic
shouldn't score well, and the off-topic test take (51.6, with relevance 0)
shows the weights enforce that.

**Q: Couldn't someone game the relevance score?**
A: On a topic they wrote themselves, yes. Repeating the topic's words scored
higher than a real answer in testing. That's why own-topic takes count only
towards the delivery levels (1, 3 and 4), which look at duration, pace and
fillers and ignore relevance. The relevance-based levels need random topics.
On a topic the speaker doesn't know in advance, the only reliable way to score
well on relevance is to actually talk about it.

**Q: How do you know the scoring is correct?**
A: Two separate questions. **Is the code correct?** Yes: 125 automated tests
check every formula against hand-calculated values, including boundaries
like exactly 120 WPM or exactly 3.0 seconds. **Do the rules match human
judgement?** Not yet validated. The thresholds are reasonable starting
values, and every raw measurement is stored so they can be calibrated against
human ratings later.

**Q: Why not let an AI give the score directly?**
A: A model's score can't be explained or checked, may change between runs,
and usually needs a GPU or the cloud. Cadence uses AI only to *measure*
(words, timings, meaning) and transparent rules to *judge*, so every point
can be traced back to a formula a user can read.
