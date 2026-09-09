// Live speech-to-text for the on-stage teleprompter, via the browser's Web
// Speech API (SpeechRecognition). This is a *speaker-facing* live caption only:
// the authoritative transcript still comes from the backend Whisper pass on the
// recorded audio. Chrome/Edge route this audio to the browser's speech service,
// so treat it as best-effort and non-authoritative.
//
// Where the API is unavailable (e.g. Firefox) this no-ops: `supported` is false
// and the caller can soften or hide the captions UI.

import { useEffect, useRef, useState } from 'react'

// Minimal shape of the Web Speech API — the DOM lib doesn't ship these types.
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: SpeechResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface LiveTranscription {
  supported: boolean
  finalText: string // everything recognised as final so far
  interim: string // the current in-flight guess
}

export function useSpeechTranscription(active: boolean): LiveTranscription {
  const supported = useRef<boolean>(!!getCtor()).current
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const keepAlive = useRef(false)

  useEffect(() => {
    if (!supported || !active) return
    const Ctor = getCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    keepAlive.current = true
    setFinalText('')
    setInterim('')

    rec.onresult = (e) => {
      let interimChunk = ''
      let finalChunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalChunk += res[0].transcript
        else interimChunk += res[0].transcript
      }
      if (finalChunk) setFinalText((prev) => `${prev} ${finalChunk.trim()}`.trim())
      setInterim(interimChunk.trim())
    }

    // Chrome ends recognition after a pause; while we're still recording, revive it.
    rec.onend = () => {
      if (!keepAlive.current) return
      try {
        rec.start()
      } catch {
        /* already (re)starting — ignore */
      }
    }

    rec.onerror = (e) => {
      // no-speech / aborted are transient (onend revives). Permission or service
      // errors are terminal — stop trying so we don't spin.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        keepAlive.current = false
      }
    }

    try {
      rec.start()
    } catch {
      /* ignore double-start */
    }

    return () => {
      keepAlive.current = false
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      setInterim('')
    }
  }, [active, supported])

  return { supported, finalText, interim }
}
