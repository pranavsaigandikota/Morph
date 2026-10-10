import { useCallback, useEffect, useRef, useState } from 'react'
import { streamUrl } from '../services/engineConfig'
import { worldApi } from '../services/worldApi'
import {
  KEYCAPS,
  MOUSE_BTN,
  encodeControl,
  isJpeg,
  parseBatchEnvelope,
  type WaypointHello,
} from '../services/waypointEnvelope'
import type { WorldFrameMeta, WorldMetrics, WorldSceneId } from '../types/world'

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
  hasFrame: boolean
  meta: WorldFrameMeta | null
  error: string | null
  metrics: WorldMetrics | null
  mock: boolean
  pointerLocked: boolean
  engineName: string | null
  width: number
  height: number
  gpuMemoryMb: number | null
  gpuMemoryAvailable: boolean
}

/** Max JPEG sub-frames waiting to paint. Keep short — favor current over stale. */
const MAX_PRESENTATION_QUEUE = 3
/** Target presentation cadence (~20 FPS browser-drawn, matching Codex verification). */
const PRESENT_FRAME_MS = 1000 / 20
const CONTROL_MS = 33
const METRICS_MS = 500

interface QueuedJpeg {
  bytes: Uint8Array
  header: WorldFrameMeta
  receivedAt: number
}

export function useWorldStream() {
  const [state, setState] = useState<WorldStreamState>({
    phase: 'idle',
    sessionId: null,
    hasFrame: false,
    meta: null,
    error: null,
    metrics: null,
    mock: false,
    pointerLocked: false,
    engineName: null,
    width: 1280,
    height: 720,
    gpuMemoryMb: null,
    gpuMemoryAvailable: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  /** Stage wrapper for pointer lock / click. */
  const stageRef = useRef<HTMLDivElement | null>(null)
  /** Actual drawing surface — browser-displayed FPS counts canvas draws. */
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const phaseRef = useRef<StreamPhase>('idle')
  const sessionIdRef = useRef<string | null>(null)
  const seedRef = useRef<string | null>(null)
  const intentionalCloseRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const mockRef = useRef(false)
  const engineNameRef = useRef<string | null>(null)
  const dimsRef = useRef({ w: 1280, h: 720, tc: 4 })
  const drawingRef = useRef(false)

  const keysRef = useRef<Set<string>>(new Set())
  const keyHeldRef = useRef<Map<string, number>>(new Map())
  const mouseRef = useRef({ dx: 0, dy: 0, scroll: 0 })
  const mouseSensRef = useRef(1.0)

  const queueRef = useRef<QueuedJpeg[]>([])
  const lastPresentRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  // Generated FPS: count every JPEG received from the wire (never reduced by presentation drops).
  const genCountRef = useRef(0)
  const genWindowStartRef = useRef(performance.now())
  const genFpsRef = useRef(0)
  // Displayed FPS: paints only
  const dispCountRef = useRef(0)
  const dispWindowStartRef = useRef(performance.now())
  const dispFpsRef = useRef(0)
  const droppedRef = useRef(0)
  const genMsEwmaRef = useRef<number | null>(null)
  const latEwmaRef = useRef<number | null>(null)

  const controlTimerRef = useRef<number | null>(null)
  const metricsTimerRef = useRef<number | null>(null)

  const setPhase = useCallback((phase: StreamPhase) => {
    phaseRef.current = phase
    setState((s) => ({ ...s, phase }))
  }, [])

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

  const publishMetrics = useCallback(() => {
    const now = performance.now()
    const genElapsed = (now - genWindowStartRef.current) / 1000
    if (genElapsed >= 0.5) {
      genFpsRef.current = genCountRef.current / genElapsed
      genCountRef.current = 0
      genWindowStartRef.current = now
    }
    const dispElapsed = (now - dispWindowStartRef.current) / 1000
    if (dispElapsed >= 0.5) {
      dispFpsRef.current = dispCountRef.current / dispElapsed
      dispCountRef.current = 0
      dispWindowStartRef.current = now
    }

    setState((s) => ({
      ...s,
      metrics: {
        session_id: sessionIdRef.current ?? '',
        generated_fps: Math.round(genFpsRef.current * 10) / 10,
        displayed_fps: Math.round(dispFpsRef.current * 10) / 10,
        latency_ms: latEwmaRef.current != null ? Math.round(latEwmaRef.current) : 0,
        dropped_frames: droppedRef.current,
        gpu_memory_mb: null, // labeled unavailable in UI unless backend supplies it
        connection_status:
          phaseRef.current === 'reconnecting'
            ? 'reconnecting'
            : phaseRef.current === 'connecting'
              ? 'connecting'
              : phaseRef.current === 'streaming' || phaseRef.current === 'paused'
                ? 'connected'
                : phaseRef.current === 'error'
                  ? 'error'
                  : 'disconnected',
        mock: mockRef.current,
        engine: engineNameRef.current,
        gen_ms_ewma: genMsEwmaRef.current,
      },
      mock: mockRef.current,
    }))
  }, [])

  const presentLoop = useCallback((t: number) => {
    rafRef.current = requestAnimationFrame(presentLoop)
    if (phaseRef.current === 'paused') return
    if (drawingRef.current) return
    if (queueRef.current.length === 0) return
    if (t - lastPresentRef.current < PRESENT_FRAME_MS) return
    lastPresentRef.current = t

    // Prefer newest queued frame; discard stale intermediates for responsiveness.
    while (queueRef.current.length > 1) {
      queueRef.current.shift()
      droppedRef.current += 1
    }
    const next = queueRef.current.shift()
    if (!next) return

    const canvas = canvasElRef.current
    if (!canvas) return
    drawingRef.current = true
    const blob = new Blob([next.bytes.slice()], { type: 'image/jpeg' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width
          canvas.height = img.height
        }
        ctx.drawImage(img, 0, 0)
        dispCountRef.current += 1
        setState((s) => ({
          ...s,
          hasFrame: true,
          meta: next.header,
          phase: phaseRef.current === 'paused' ? 'paused' : 'streaming',
        }))
      }
      URL.revokeObjectURL(url)
      drawingRef.current = false
    }
    img.onerror = () => {
      droppedRef.current += 1
      URL.revokeObjectURL(url)
      drawingRef.current = false
    }
    img.src = url
  }, [])

  const enqueueJpegs = useCallback(
    (
      jpegs: Uint8Array[],
      wireHeader: {
        frame_id: number
        gen_ms: number
        temporal_compression: number
        client_ts?: number | null
      },
    ) => {
      // Count ALL received sub-frames toward generated FPS (before any presentation drop).
      genCountRef.current += jpegs.length

      if (typeof wireHeader.gen_ms === 'number') {
        genMsEwmaRef.current =
          genMsEwmaRef.current == null
            ? wireHeader.gen_ms
            : genMsEwmaRef.current * 0.85 + wireHeader.gen_ms * 0.15
      }
      if (wireHeader.client_ts && wireHeader.client_ts > 0) {
        const lat = performance.now() - wireHeader.client_ts
        latEwmaRef.current =
          latEwmaRef.current == null ? lat : latEwmaRef.current * 0.85 + lat * 0.15
      }

      const baseMeta: WorldFrameMeta = {
        frame_id: wireHeader.frame_id,
        sequence: wireHeader.frame_id,
        generated_at_ms: Date.now(),
        inference_ms: Math.round(wireHeader.gen_ms ?? 0),
        width: dimsRef.current.w,
        height: dimsRef.current.h,
        mime: 'image/jpeg',
        mock: mockRef.current,
        temporal_compression: wireHeader.temporal_compression,
        client_ts: wireHeader.client_ts,
      }

      for (let i = 0; i < jpegs.length; i++) {
        const bytes = jpegs[i]!
        if (!isJpeg(bytes)) {
          droppedRef.current += 1
          continue
        }
        queueRef.current.push({
          bytes,
          header: {
            ...baseMeta,
            frame_id: wireHeader.frame_id + i,
            sequence: wireHeader.frame_id + i,
          },
          receivedAt: performance.now(),
        })
      }

      // Bound presentation queue — drop oldest stale frames (does NOT affect generated_fps).
      while (queueRef.current.length > MAX_PRESENTATION_QUEUE) {
        queueRef.current.shift()
        droppedRef.current += 1
      }
    },
    [],
  )

  const sendControl = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (phaseRef.current === 'paused') {
      // Idle snapshot while paused — don't accumulate look deltas.
      mouseRef.current.dx = 0
      mouseRef.current.dy = 0
      mouseRef.current.scroll = 0
      ws.send(
        encodeControl({
          buttons: [],
          dx: 0,
          dy: 0,
          scroll: 0,
          ts: performance.now(),
        }),
      )
      return
    }

    const sens = mouseSensRef.current
    const dx = Math.max(-1, Math.min(1, (mouseRef.current.dx * sens) / 200))
    const dy = Math.max(-1, Math.min(1, (mouseRef.current.dy * sens) / 200))
    const scroll = mouseRef.current.scroll
    mouseRef.current.dx = 0
    mouseRef.current.dy = 0
    mouseRef.current.scroll = 0

    ws.send(
      encodeControl({
        buttons: [...keysRef.current],
        dx,
        dy,
        scroll,
        ts: performance.now(),
      }),
    )
  }, [])

  const openSocket = useCallback(
    (seed: string | null) => {
      intentionalCloseRef.current = false
      setPhase('connecting')
      setState((s) => ({ ...s, error: null }))

      const url = streamUrl(seed)
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptRef.current = 0
        clearTimers()
        controlTimerRef.current = window.setInterval(sendControl, CONTROL_MS)
        metricsTimerRef.current = window.setInterval(publishMetrics, METRICS_MS)
      }

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data) as { type?: string; msg?: string } & Partial<WaypointHello>
            if (msg.type === 'hello') {
              const hello = msg as WaypointHello
              sessionIdRef.current = hello.session_id
              mockRef.current = !!hello.mock || /mock/i.test(hello.engine)
              engineNameRef.current = hello.engine
              dimsRef.current = {
                w: hello.width,
                h: hello.height,
                tc: hello.temporal_compression || 4,
              }
              setPhase('streaming')
              setState((s) => ({
                ...s,
                sessionId: hello.session_id,
                engineName: hello.engine,
                width: hello.width,
                height: hello.height,
                mock: mockRef.current,
                error: null,
              }))
              return
            }
            if (msg.type === 'error') {
              const busy = (msg.msg || '').toLowerCase().includes('busy')
              setState((s) => ({
                ...s,
                phase: 'error',
                error: msg.msg ?? 'Engine error',
              }))
              if (busy) intentionalCloseRef.current = true
            }
            if (msg.type === 'status' && (msg as { status?: string }).status === 'paused') {
              setPhase('paused')
            }
          } catch {
            // ignore
          }
          return
        }

        try {
          const { header, jpegs } = parseBatchEnvelope(ev.data as ArrayBuffer)
          enqueueJpegs(jpegs, header)
          if (phaseRef.current === 'connecting') setPhase('streaming')
        } catch (err) {
          console.warn('[world] bad envelope', err)
          droppedRef.current += 1
        }
      }

      ws.onerror = () => {
        setState((s) => ({ ...s, error: s.error ?? 'WebSocket error' }))
      }

      ws.onclose = () => {
        clearTimers()
        wsRef.current = null
        if (intentionalCloseRef.current) {
          if (phaseRef.current !== 'error') setPhase('disconnected')
          return
        }
        const attempt = reconnectAttemptRef.current + 1
        reconnectAttemptRef.current = attempt
        if (attempt > 8) {
          setState((s) => ({
            ...s,
            phase: 'error',
            error: 'Connection lost after multiple reconnect attempts',
          }))
          return
        }
        setPhase('reconnecting')
        const delay = Math.min(8000, 400 * 2 ** (attempt - 1))
        window.setTimeout(() => {
          if (!intentionalCloseRef.current) openSocket(seedRef.current)
        }, delay)
      }
    },
    [clearTimers, enqueueJpegs, publishMetrics, sendControl, setPhase],
  )

  const start = useCallback(
    async (_sceneId: WorldSceneId, _prompt: string, seed?: string | null) => {
      setState((s) => ({
        ...s,
        phase: 'starting',
        error: null,
        hasFrame: false,
        meta: null,
        metrics: null,
      }))
      queueRef.current = []
      droppedRef.current = 0
      genCountRef.current = 0
      dispCountRef.current = 0
      genWindowStartRef.current = performance.now()
      dispWindowStartRef.current = performance.now()
      genMsEwmaRef.current = null
      latEwmaRef.current = null

      const probe = await worldApi.probe()
      if (!probe.ok) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error:
            probe.message ??
            'Waypoint engine unreachable at configured origin (expected :8000). Is Codex serving? Use npm run dev:mock only if you explicitly want the protocol mock.',
          mock: false,
        }))
        return
      }
      // LIVE vs MOCK comes only from a successful engine hello / status — never from a failed probe.
      mockRef.current = probe.mock
      engineNameRef.current = probe.engine ?? null
      seedRef.current = seed ?? null
      openSocket(seedRef.current)
    },
    [openSocket],
  )

  const pause = useCallback(() => {
    if (phaseRef.current === 'paused') setPhase('streaming')
    else if (phaseRef.current === 'streaming') setPhase('paused')
  }, [setPhase])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimers()
    if (wsRef.current && wsRef.current.readyState < 2) {
      wsRef.current.close()
      wsRef.current = null
    }
    sessionIdRef.current = null
    keysRef.current.clear()
    keyHeldRef.current.clear()
    mouseRef.current = { dx: 0, dy: 0, scroll: 0 }
    queueRef.current = []
    setState((s) => ({
      ...s,
      phase: 'disconnected',
      sessionId: null,
      hasFrame: false,
      meta: null,
      error: null,
      pointerLocked: false,
    }))
  }, [clearTimers])

  const reset = useCallback(async () => {
    intentionalCloseRef.current = true
    clearTimers()
    if (wsRef.current && wsRef.current.readyState < 2) wsRef.current.close()
    wsRef.current = null
    queueRef.current = []
    droppedRef.current = 0
    keysRef.current.clear()
    keyHeldRef.current.clear()
    mouseRef.current = { dx: 0, dy: 0, scroll: 0 }
    await new Promise((r) => setTimeout(r, 200))
    intentionalCloseRef.current = false
    openSocket(seedRef.current)
  }, [clearTimers, openSocket])

  const reconnect = useCallback(() => {
    intentionalCloseRef.current = false
    reconnectAttemptRef.current = 0
    if (wsRef.current && wsRef.current.readyState < 2) {
      intentionalCloseRef.current = true
      wsRef.current.close()
    }
    window.setTimeout(() => {
      intentionalCloseRef.current = false
      openSocket(seedRef.current)
    }, 100)
  }, [openSocket])

  const requestPointerLock = useCallback(() => {
    const el = canvasElRef.current ?? stageRef.current
    el?.requestPointerLock()
  }, [])

  // Input listeners
  useEffect(() => {
    const playing = () =>
      phaseRef.current === 'streaming' ||
      phaseRef.current === 'paused' ||
      phaseRef.current === 'connecting' ||
      phaseRef.current === 'reconnecting'

    const onKeyDown = (e: KeyboardEvent) => {
      if (!playing()) return
      const k = KEYCAPS[e.code]
      if (!k) return
      if (!e.repeat) keyHeldRef.current.set(k, (keyHeldRef.current.get(k) || 0) + 1)
      keysRef.current.add(k)
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = KEYCAPS[e.code]
      if (!k) return
      const n = (keyHeldRef.current.get(k) || 0) - 1
      if (n <= 0) {
        keyHeldRef.current.delete(k)
        keysRef.current.delete(k)
      } else keyHeldRef.current.set(k, n)
    }
    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== 'streaming') return
      if (document.pointerLockElement == null && !e.buttons) {
        // Allow look without lock only when pointer is over stage with movement accumulation
        // during active streaming after click — still require lock for continuous look.
      }
      if (document.pointerLockElement == null) return
      mouseRef.current.dx += e.movementX
      mouseRef.current.dy += e.movementY
    }
    const onWheel = (e: WheelEvent) => {
      if (phaseRef.current !== 'streaming') return
      mouseRef.current.scroll = e.deltaY > 0 ? -1 : 1
      e.preventDefault()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (phaseRef.current !== 'streaming') return
      const m = MOUSE_BTN[e.button]
      if (m) {
        keysRef.current.add(m)
        e.preventDefault()
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      const m = MOUSE_BTN[e.button]
      if (m) keysRef.current.delete(m)
    }
    const onLock = () => {
      setState((s) => ({ ...s, pointerLocked: document.pointerLockElement != null }))
    }
    const onBlur = () => {
      keysRef.current.clear()
      keyHeldRef.current.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('pointerlockchange', onLock)
    window.addEventListener('blur', onBlur)

    rafRef.current = requestAnimationFrame(presentLoop)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerlockchange', onLock)
      window.removeEventListener('blur', onBlur)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [presentLoop])

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      clearTimers()
      wsRef.current?.close()
    }
  }, [clearTimers])

  return {
    ...state,
    stageRef,
    canvasElRef,
    mouseSens: mouseSensRef,
    setMouseSens: (v: number) => {
      mouseSensRef.current = Math.max(0.5, Math.min(3, v))
    },
    start,
    pause,
    reset,
    disconnect,
    reconnect,
    requestPointerLock,
  }
}
