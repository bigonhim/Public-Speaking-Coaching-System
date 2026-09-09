// Microphone capture via MediaRecorder. Records audio/webm;codecs=opus (Chrome
// default, decodable by faster-whisper/PyAV). Exposes the live MediaStream so
// the virtual audience can react to volume in real time.

import { useCallback, useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'recording' | 'stopped'

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export interface RecorderApi {
  status: Status
  isRecording: boolean
  elapsedSec: number
  error: string | null
  stream: MediaStream | null
  /** The container actually negotiated, e.g. "audio/webm;codecs=opus". Null
   *  until a recording has started. The upload is named from this so the file
   *  on disk is not a .webm that is really ogg (or, on Safari, mp4). */
  mimeType: string | null
  /** Resolves true when the mic is live. False means `error` explains why —
   *  the caller must not switch to a recording UI on a false. */
  start: () => Promise<boolean>
  stop: () => Promise<Blob | null>
  reset: () => void
}

export function useRecorder(): RecorderApi {
  const [status, setStatus] = useState<Status>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopStream = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach((t) => t.stop())
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    setError(null)
    chunksRef.current = []

    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked. Enable it in your browser to record.')
      setStatus('idle')
      return false
    }

    try {
      const recorder = new MediaRecorder(media, { mimeType: pickMimeType() || undefined })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250) // gather chunks periodically
      recorderRef.current = recorder
      setMimeType(recorder.mimeType || null)
      setStream(media)
      startTimeRef.current = performance.now()
      setElapsedSec(0)
      setStatus('recording')
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setElapsedSec((performance.now() - startTimeRef.current) / 1000)
      }, 200)
      return true
    } catch {
      // The mic is already open at this point. Releasing it is not optional:
      // leaving the tracks live keeps the browser's recording indicator lit
      // for the rest of the visit with nothing listening to it.
      stopStream(media)
      setError('This browser could not start a recording. Try Chrome or Edge.')
      setStatus('idle')
      return false
    }
  }, [stopStream])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    clearTimer()
    if (!recorder || recorder.state === 'inactive') {
      setStatus('stopped')
      return null
    }
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorder.stop()
    })
    stopStream(stream)
    setStream(null)
    setStatus('stopped')
    return blob
  }, [stream, stopStream])

  const reset = useCallback(() => {
    clearTimer()
    stopStream(stream)
    setStream(null)
    setStatus('idle')
    setElapsedSec(0)
    setError(null)
    setMimeType(null)
    chunksRef.current = []
  }, [stream, stopStream])

  // Clean up the mic on unmount.
  useEffect(() => {
    return () => {
      clearTimer()
      stopStream(recorderRef.current?.stream ?? null)
    }
  }, [stopStream])

  return {
    status,
    isRecording: status === 'recording',
    elapsedSec,
    error,
    stream,
    mimeType,
    start,
    stop,
    reset,
  }
}
