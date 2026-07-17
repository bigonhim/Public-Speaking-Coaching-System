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
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  reset: () => void
}

export function useRecorder(): RecorderApi {
  const [status, setStatus] = useState<Status>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

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

  const start = useCallback(async () => {
    setError(null)
    chunksRef.current = []
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(media, { mimeType: pickMimeType() || undefined })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(250) // gather chunks periodically
      recorderRef.current = recorder
      setStream(media)
      startTimeRef.current = performance.now()
      setElapsedSec(0)
      setStatus('recording')
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setElapsedSec((performance.now() - startTimeRef.current) / 1000)
      }, 200)
    } catch {
      setError('Microphone access was blocked. Enable it in your browser to record.')
      setStatus('idle')
    }
  }, [])

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
    start,
    stop,
    reset,
  }
}
