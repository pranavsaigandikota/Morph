import { useCallback, useEffect, useRef, useState } from 'react'
import { wsUrl } from '../services/api'
import { worldApi } from '../services/worldApi'
import { FrameTransport } from '../services/worldTransport'
import type { WorldControlMessage, WorldFrameMeta, WorldMetrics, WorldSceneId } from '../types/world'
import { useKeyboardControls } from './useKeyboardControls'

export type StreamPhase =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'streaming'
  | 'paused'
  | 'reconnecting'
  | 'error'
  | 'disconnected'

interface WorldStreamState {
  phase: StreamPhase
  sessionId: string | null
  frameUrl: string | null
  meta: WorldFrameMeta | null
  error: string | null
  metrics: WorldMetrics | null
  mock: boolean
  pointerLocked: boolean
}

const CONTROL_HZ = 30
const METRICS_HZ = 2
/** Keep at most one pending object URL — drop stale frames, never queue. */
const MAX_PENDING_FRAMES = 1

export function useWorldStream() {
  const [state, setState] = useState<WorldStreamState>({
    phase: 'idle',
    sessionId: null,
    frameUrl: null,
    meta: null,
    error: null,
    metrics: null,
    mock: true,
    pointerLocked: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const transportRef = useRef<FrameTransport | null>(null)
  const seqRef = useRef(0)
  const mouseDeltaRef = useRef({ dx: 0, dy: 0 })
  const controlTimerRef = useRef<number | null>(null)
  const metricsTimerRef = useRef<number | null>(null)
  const frameUrlRef = useRef<string | null>(null)
  const pendingBytesRef = useRef(0)
  const displayedCountRef = useRef(0)
  const displayWindowStartRef = useRef(Date.now())
  const reconnectAttemptRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const phaseRef = useRef<StreamPhase>('idle')
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const keysRef = useKeyboardControls(
    state.phase === 'streaming' || state.phase === 'paused' || state.phase === 'connecting',
  )

  const setPhase = useCallback((phase: StreamPhase) => {
    phaseRef.current = phase
    setState((s) => ({ ...s, phase }))
  }, [])

  const revokeFrame = useCallback(() => {
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = null
    }
  }, [])

  const applyFrame = useCallback(
    (bytes: ArrayBuffer, meta: WorldFrameMeta) => {
      // Drop if we already have a frame waiting to paint (unbounded buffer guard)
      if (pendingBytesRef.current >= MAX_PENDING_FRAMES) {
        return
      }
      pendingBytesRef.current += 1
      const blob = new Blob([bytes], { type: meta.mime || 'image/png' })
      const url = URL.createObjectURL(blob)
      const prev = frameUrlRef.current
      frameUrlRef.current = url
      displayedCountRef.current += 1
      setState((s) => ({
        ...s,
        frameUrl: url,
        meta,
        mock: meta.mock,
        phase: phaseRef.current === 'paused' ? 'paused' : 'streaming',
      }))
      if (prev) URL.revokeObjectURL(prev)
      // Allow next frame on next tick after React commit
      queueMicrotask(() => {
        pendingBytesRef.current = Math.max(0, pendingBytesRef.current - 1)
      })
    },
    [],
  )

  const clearTimers = useCallback(() => {
    if (controlTimerRef.current) {
      window.clearInterval(controlTimerRef.current)
      controlTimerRef.current = null
    }
    if (metricsTimerRef.current) {
      window.clearInterval(metricsTimerRef.current)
      metricsTimerRef.current = null
    }
  }, [])

  const sendControl = useCallback(() => {
    const ws = wsRef.current
    const transport = transportRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !transport) return
    if (phaseRef.current === 'paused') return

    seqRef.current += 1
    const { dx, dy } = mouseDeltaRef.current
    mouseDeltaRef.current = { dx: 0, dy: 0 }
    const msg: WorldControlMessage = {
      type: 'control',
      seq: seqRef.current,
      keys: [...keysRef.current],
      mouse_dx: dx,
      mouse_dy: dy,
      timestamp_ms: Date.now(),
    }
    ws.send(transport.encodeControl(msg))
  }, [keysRef])

  const pollMetrics = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    try {
      const metrics = await worldApi.metrics(id)
      const elapsed = (Date.now() - displayWindowStartRef.current) / 1000
      const displayedFps =
        elapsed > 0 ? Math.round((displayedCountRef.current / elapsed) * 10) / 10 : 0
      if (elapsed > 2) {
        displayedCountRef.current = 0
        displayWindowStartRef.current = Date.now()
      }
      setState((s) => ({
        ...s,
        metrics: {
          ...metrics,
          displayed_fps: displayedFps || metrics.displayed_fps,
          connection_status:
            phaseRef.current === 'reconnecting'
              ? 'reconnecting'
              : phaseRef.current === 'streaming' || phaseRef.current === 'paused'
                ? 'connected'
                : metrics.connection_status,
        },
        mock: metrics.mock,
      }))
    } catch {
      // ignore transient
    }
  }, [])

  const openSocket = useCallback(
    (sessionId: string) => {
      intentionalCloseRef.current = false
      setPhase('connecting')
      const ws = new WebSocket(wsUrl(`/world/stream?session_id=${encodeURIComponent(sessionId)}`))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      const transport = new FrameTransport((inbound) => {
        if (inbound.kind === 'frame') {
          reconnectAttemptRef.current = 0
          applyFrame(inbound.bytes, inbound.meta)
        } else if (inbound.kind === 'status') {
          if (inbound.status.status === 'paused') setPhase('paused')
          if (inbound.status.status === 'streaming') setPhase('streaming')
          if (inbound.status.status === 'error') {
            setState((s) => ({
              ...s,
              phase: 'error',
              error: inbound.status.message ?? 'Stream error',
            }))
          }
        }
      })
      transportRef.current = transport

      ws.onopen = () => {
        setPhase('streaming')
        clearTimers()
        controlTimerRef.current = window.setInterval(sendControl, 1000 / CONTROL_HZ)
        metricsTimerRef.current = window.setInterval(pollMetrics, 1000 / METRICS_HZ)
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') transport.handleMessage(ev.data)
        else transport.handleMessage(ev.data as ArrayBuffer)
      }

      ws.onerror = () => {
        setState((s) => ({ ...s, error: 'WebSocket error' }))
      }

      ws.onclose = () => {
        clearTimers()
        wsRef.current = null
        if (intentionalCloseRef.current) {
          setPhase('disconnected')
          return
        }
        // Reconnect with backoff
        const attempt = reconnectAttemptRef.current + 1
        reconnectAttemptRef.current = attempt
        if (attempt > 5) {
          setState((s) => ({
            ...s,
            phase: 'error',
            error: 'Connection lost after multiple reconnect attempts',
          }))
          return
        }
        setPhase('reconnecting')
        const delay = Math.min(8000, 500 * 2 ** (attempt - 1))
        window.setTimeout(() => {
          if (sessionIdRef.current === sessionId && !intentionalCloseRef.current) {
            openSocket(sessionId)
          }
        }, delay)
      }
    },
    [applyFrame, clearTimers, pollMetrics, sendControl, setPhase],
  )

  const start = useCallback(
    async (sceneId: WorldSceneId, prompt: string) => {
      setState((s) => ({
        ...s,
        phase: 'starting',
        error: null,
        frameUrl: null,
        meta: null,
        metrics: null,
      }))
      revokeFrame()
      try {
        const res = await worldApi.start({
          scene_id: sceneId,
          seed_image_path: null,
          prompt,
        })
        sessionIdRef.current = res.session_id
        setState((s) => ({ ...s, sessionId: res.session_id }))
        // Brief wait for session ready
        await new Promise((r) => setTimeout(r, 450))
        openSocket(res.session_id)
      } catch (err) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: err instanceof Error ? err.message : 'Failed to start world session',
        }))
      }
    },
    [openSocket, revokeFrame],
  )

  const pause = useCallback(() => {
    const ws = wsRef.current
    const transport = transportRef.current
    if (!ws || !transport || ws.readyState !== WebSocket.OPEN) return
    if (phaseRef.current === 'paused') {
      ws.send(transport.encodeResume())
      setPhase('streaming')
    } else {
      ws.send(transport.encodePause())
      setPhase('paused')
    }
  }, [setPhase])

  const reset = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id) return
    try {
      await worldApi.reset(id)
      mouseDeltaRef.current = { dx: 0, dy: 0 }
      keysRef.current.clear()
      setState((s) => ({ ...s, error: null }))
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Reset failed',
      }))
    }
  }, [keysRef])

  const disconnect = useCallback(async () => {
    intentionalCloseRef.current = true
    clearTimers()
    const id = sessionIdRef.current
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (id) {
      try {
        await worldApi.stop(id)
      } catch {
        // ignore
      }
    }
    sessionIdRef.current = null
    revokeFrame()
    setState({
      phase: 'disconnected',
      sessionId: null,
      frameUrl: null,
      meta: null,
      error: null,
      metrics: null,
      mock: true,
      pointerLocked: false,
    })
  }, [clearTimers, revokeFrame])

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (document.pointerLockElement == null) return
    mouseDeltaRef.current.dx += e.movementX
    mouseDeltaRef.current.dy += e.movementY
  }, [])

  const requestPointerLock = useCallback(() => {
    canvasRef.current?.requestPointerLock()
  }, [])

  useEffect(() => {
    const onLockChange = () => {
      setState((s) => ({ ...s, pointerLocked: document.pointerLockElement != null }))
    }
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [onMouseMove])

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      clearTimers()
      wsRef.current?.close()
      revokeFrame()
    }
  }, [clearTimers, revokeFrame])

  return {
    ...state,
    canvasRef,
    start,
    pause,
    reset,
    disconnect,
    requestPointerLock,
  }
}
