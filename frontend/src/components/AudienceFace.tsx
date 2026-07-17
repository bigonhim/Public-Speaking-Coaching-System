// A single audience member, rendered with DiceBear. The expression is driven
// by a discrete face state; identity (the seed) stays fixed so a given person
// keeps their look while only their expression changes.

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { funEmoji } from '@dicebear/collection'

export type FaceState = 'attentive' | 'nodding' | 'neutral' | 'bored' | 'distracted'

// Map each state to DiceBear funEmoji eyes/mouth options.
const EXPRESSION: Record<FaceState, { eyes: string; mouth: string }> = {
  nodding: { eyes: 'cute', mouth: 'wideSmile' },
  attentive: { eyes: 'plain', mouth: 'lilSmile' },
  neutral: { eyes: 'plain', mouth: 'plain' },
  bored: { eyes: 'sleepClose', mouth: 'sad' },
  distracted: { eyes: 'closed', mouth: 'plain' },
}

const MOTION: Record<FaceState, string> = {
  nodding: 'animate-[breathe_2.4s_ease-in-out_infinite] origin-bottom',
  attentive: '',
  neutral: '',
  bored: 'opacity-80',
  distracted: 'opacity-60 -rotate-6',
}

interface Props {
  seed: string
  state: FaceState
  size?: number
}

export function AudienceFace({ seed, state, size = 56 }: Props) {
  const uri = useMemo(() => {
    const { eyes, mouth } = EXPRESSION[state]
    return createAvatar(funEmoji, {
      seed,
      size,
      radius: 50,
      eyes: [eyes as never],
      mouth: [mouth as never],
    }).toDataUri()
  }, [seed, state, size])

  return (
    <img
      src={uri}
      alt=""
      width={size}
      height={size}
      className={`transition-all duration-500 ${MOTION[state]}`}
      style={{ width: size, height: size }}
    />
  )
}
