// A single audience member, rendered as a human-style DiceBear "personas"
// portrait — diverse skin tones, hair and clothing. Identity (the seed) stays
// fixed so a given person keeps their look while only their expression and
// posture change with engagement.
//
// "Alive" is the whole point here: each face blinks on its own jittered
// cadence, sways gently out of phase with its neighbours, leans toward the
// stage when engaged and slumps / glances away when it drifts. This is all
// presentation — it is NOT a second analysis engine.

import { useEffect, useMemo, useState } from 'react'
import { createAvatar } from '@dicebear/core'
import { personas } from '@dicebear/collection'

export type FaceState = 'attentive' | 'nodding' | 'neutral' | 'bored' | 'distracted'

// personas eyes:  open | sleep | wink | glasses | happy | sunglasses
// personas mouth: smile | frown | surprise | pacifier | bigSmile | smirk | lips
const EXPRESSION: Record<FaceState, { eyes: string; mouth: string }> = {
  nodding: { eyes: 'happy', mouth: 'bigSmile' },
  attentive: { eyes: 'open', mouth: 'smile' },
  neutral: { eyes: 'open', mouth: 'lips' },
  bored: { eyes: 'sleep', mouth: 'frown' },
  distracted: { eyes: 'sleep', mouth: 'lips' },
}

// Posture: leans toward the stage when engaged, slumps / turns away when not.
// Applied via a CSS transition so state changes glide instead of snapping.
const POSTURE: Record<FaceState, string> = {
  nodding: '-translate-y-1 scale-[1.06]',
  attentive: '-translate-y-0.5 scale-[1.03]',
  neutral: 'scale-100',
  bored: 'translate-y-[2px] scale-[0.97] opacity-80',
  distracted: 'translate-x-[3px] -rotate-6 opacity-60',
}

// Faces whose eyes are already shut have nothing to blink.
const eyesClosed = (s: FaceState) => s === 'bored' || s === 'distracted'

// personas portraits carry a lot of transparent padding; zoom in so the head
// fills its seat instead of floating in whitespace (makes faces read bigger).
const FACE_SCALE = 150

function avatarUri(seed: string, size: number, eyes: string, mouth: string) {
  return createAvatar(personas, {
    seed,
    size,
    scale: FACE_SCALE,
    eyes: [eyes as never],
    mouth: [mouth as never],
  }).toDataUri()
}

interface Props {
  seed: string
  state: FaceState
  size?: number
  /** 0..1 phase offset so neighbouring faces never sway/blink in lockstep. */
  phase?: number
}

export function AudienceFace({ seed, state, size = 60, phase = 0 }: Props) {
  // Pre-bake the open-eyed expression and a matching closed-eyed frame so a
  // blink is just a cheap <img src> swap rather than a re-render of the avatar.
  const { openUri, closedUri } = useMemo(() => {
    const { eyes, mouth } = EXPRESSION[state]
    return {
      openUri: avatarUri(seed, size, eyes, mouth),
      closedUri: avatarUri(seed, size, 'sleep', mouth),
    }
  }, [seed, state, size])

  // Independent, jittered blink loop — a short shut every ~3–6s, never synced.
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    if (eyesClosed(state)) {
      setBlinking(false)
      return
    }
    let alive = true
    let timer: number
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return
        setBlinking(true)
        timer = window.setTimeout(() => {
          if (!alive) return
          setBlinking(false)
          schedule()
        }, 120)
      }, 2600 + Math.random() * 3800)
    }
    schedule()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [state])

  const idle = state === 'nodding' ? 'animate-audience-nod' : 'animate-audience-sway'

  return (
    <div
      className="grid place-items-center overflow-hidden rounded-full bg-[#262823] shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.07]"
      style={{ width: size, height: size }}
    >
      {/* idle layer — a continuous sway/nod, offset per face via animationDelay */}
      <div
        className={`${idle} motion-reduce:animate-none`}
        style={{ animationDelay: `${-phase * 5.5}s` }}
      >
        {/* posture layer — smoothly leans in / slumps / turns away on state change */}
        <div className={`transition-all duration-700 ease-out ${POSTURE[state]}`}>
          <img
            src={blinking ? closedUri : openUri}
            alt=""
            width={size}
            height={size}
            draggable={false}
            className="block select-none"
            style={{ width: size, height: size }}
          />
        </div>
      </div>
    </div>
  )
}
