import { useCallback, useEffect, useRef, useState } from 'react'
import { streamUrl } from '../services/engineConfig'
import { worldApi } from '../services/worldApi'
import {
  KEYCAPS,
  MOUSE_BTN,
  isJpeg,
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
const CONTROL_MS = 50
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
  const [activeSeed,setActiveSeed]=useState<string|null>(null)
  const phaseRef = useRef<StreamPhase>('idle')
  const sessionIdRef = useRef<string | null>(null)
  const seedRef = useRef<string | null>(null)
  const intentionalCloseRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const mockRef = useRef(false)
  const engineNameRef = useRef<string | null>(null)
  const dimsRef = useRef({ w: 1280, h: 720, tc: 4 })
  const drawingRef = useRef(false)
  const seqRef = useRef(0)
  const requestGenerationRef = useRef(0)
  const wireRef = useRef<Record<string, number> | null>(null)
  const epochRef = useRef(-1)
  const serverMetricsRef = useRef<Record<string, number>>({})
  const proofRef = useRef({received:0,displayed:0,gaps:0,ordering:0,decode_errors:0,protocol_errors:0,
    first_frame_at:0,last_frame_id:0,epoch:-1,key_events:0,mouse_events:0,ack_ms:[] as number[],
    applied_to_draw_ms:[] as number[],last_applied_seq:-1,draw_at:[] as number[]})

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

    if(canvasElRef.current) canvasElRef.current.dataset.telemetry = JSON.stringify({
      ...proofRef.current, presentation_drops:droppedRef.current, at:performance.now(),
      session_id:sessionIdRef.current, phase:phaseRef.current, server:serverMetricsRef.current,
      pointer_locked:document.pointerLockElement != null})
    setState((s) => ({
      ...s,
      metrics: {
        session_id: sessionIdRef.current ?? '',
        generated_fps: Math.round(genFpsRef.current * 10) / 10,
        displayed_fps: Math.round(dispFpsRef.current * 10) / 10,
        latency_ms: latEwmaRef.current != null ? Math.round(latEwmaRef.current) : 0,
        dropped_frames: droppedRef.current,
        presentation_skips:droppedRef.current,
        decode_errors:proofRef.current.decode_errors,
        server_drops:serverMetricsRef.current.dropped_frames??null,
        gpu_memory_mb: serverMetricsRef.current.vram_mb ?? null,
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
      if(phaseRef.current!=='streaming' || next.header.epoch!==epochRef.current) {
        URL.revokeObjectURL(url);drawingRef.current=false;return
      }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width
          canvas.height = img.height
        }
        ctx.drawImage(img, 0, 0)
        dispCountRef.current += 1
        proofRef.current.displayed++
        proofRef.current.draw_at.push(performance.now())
        if(proofRef.current.draw_at.length > 10000) proofRef.current.draw_at.shift()
        const seq = next.header.control_seq ?? -1
        if(seq > proofRef.current.last_applied_seq && next.header.client_ts != null) {
          proofRef.current.last_applied_seq=seq
          proofRef.current.applied_to_draw_ms.push(performance.now()-next.header.client_ts)
        if(proofRef.current.applied_to_draw_ms.length>5000) proofRef.current.applied_to_draw_ms.shift()
        }
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
      proofRef.current.decode_errors++
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
        generated_at_ms?:number
        seq?:number
        epoch?:number
      },
    ) => {
      // Count ALL received sub-frames toward generated FPS (before any presentation drop).
      genCountRef.current += jpegs.length
      proofRef.current.received+=jpegs.length
      if(!proofRef.current.first_frame_at) proofRef.current.first_frame_at=performance.now()

      if (typeof wireHeader.gen_ms === 'number') {
        genMsEwmaRef.current =
          genMsEwmaRef.current == null
            ? wireHeader.gen_ms
            : genMsEwmaRef.current * 0.85 + wireHeader.gen_ms * 0.15
      }
      const baseMeta: WorldFrameMeta = {
        frame_id: wireHeader.frame_id,
        sequence: wireHeader.frame_id,
        generated_at_ms: wireHeader.generated_at_ms ?? 0,
        inference_ms: Math.round(wireHeader.gen_ms ?? 0),
        width: dimsRef.current.w,
        height: dimsRef.current.h,
        mime: 'image/jpeg',
        mock: mockRef.current,
        temporal_compression: wireHeader.temporal_compression,
        client_ts: wireHeader.client_ts,
        control_seq:wireHeader.seq,
        epoch:wireHeader.epoch,
      }

      for (let i = 0; i < jpegs.length; i++) {
        const bytes = jpegs[i]!
        if (!isJpeg(bytes)) {
          proofRef.current.decode_errors++
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
    const ws=wsRef.current
    if(!ws || ws.readyState!==WebSocket.OPEN || ws.bufferedAmount>4096) return
    const paused=phaseRef.current==='paused'
    ws.send(JSON.stringify({type:'control',seq:++seqRef.current,
      keys:paused?[]:[...keysRef.current].filter(k=>/^[WASD]$/.test(k)).map(k=>k.toLowerCase()),
      mouse_dx:paused?0:Math.max(-1000,Math.min(1000,mouseRef.current.dx*mouseSensRef.current)),
      mouse_dy:paused?0:Math.max(-1000,Math.min(1000,mouseRef.current.dy*mouseSensRef.current)),
      timestamp_ms:performance.now()}))
    mouseRef.current={dx:0,dy:0,scroll:0}
  }, [])

  const openSocket = useCallback(
    (sessionId: string) => {
      intentionalCloseRef.current = false
      setPhase('connecting')
      setState((s) => ({ ...s, error: null }))

      const url = streamUrl(sessionId)
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if(wsRef.current!==ws) {ws.close();return}
        reconnectAttemptRef.current = 0
        clearTimers()
        controlTimerRef.current = window.setInterval(sendControl, CONTROL_MS)
        metricsTimerRef.current = window.setInterval(() => {
          publishMetrics()
          void worldApi.metrics(sessionId).then(m=>{if(m) serverMetricsRef.current=m})
        }, METRICS_MS)
      }

      ws.onmessage = (ev) => {
        if(wsRef.current!==ws) return
        if (wsRef.current !== ws) return
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data) as {type?:string;msg?:string;message?:string;epoch?:number;timestamp_ms?:number} & Partial<Omit<WaypointHello,'type'>>
            if(msg.type==='frame') { wireRef.current=JSON.parse(ev.data); return }
            if(msg.type==='control_ack' && msg.timestamp_ms != null) {
              const rtt=performance.now()-msg.timestamp_ms
              proofRef.current.ack_ms.push(rtt)
              if(proofRef.current.ack_ms.length>5000) proofRef.current.ack_ms.shift()
              latEwmaRef.current=latEwmaRef.current==null?rtt:latEwmaRef.current*.85+rtt*.15
              return
            }
            if(msg.epoch != null && msg.epoch!==epochRef.current) {
              epochRef.current=msg.epoch; queueRef.current=[]
              proofRef.current.last_frame_id=0; proofRef.current.epoch=msg.epoch
            }
            if (msg.type === 'hello') {
              const hello = { ...msg, session_id:sessionId,engine:'Waypoint FP8',width:640,height:360,
                temporal_compression:4,mock:false } as WaypointHello
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
              const busy = (msg.message || msg.msg || '').toLowerCase().includes('busy')
              setState((s) => ({
                ...s,
                phase: 'error',
                error: msg.message ?? msg.msg ?? 'Engine error',
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
          const m=wireRef.current; wireRef.current=null
          if(!m) throw new Error('JPEG without frame metadata')
          const bytes=new Uint8Array(ev.data as ArrayBuffer)
          if(proofRef.current.last_frame_id && m.epoch===proofRef.current.epoch) {
            if(m.frame_id<=proofRef.current.last_frame_id) proofRef.current.ordering++
            else proofRef.current.gaps+=Math.max(0,m.frame_id-proofRef.current.last_frame_id-1)
          }
          proofRef.current.last_frame_id=m.frame_id; proofRef.current.epoch=m.epoch
          enqueueJpegs([bytes],{frame_id:m.frame_id,gen_ms:m.inference_ms,temporal_compression:4,
            client_ts:m.client_timestamp_ms,generated_at_ms:m.generated_at_ms,seq:m.seq,epoch:m.epoch})
          // Credit released after handoff to our bounded presentation queue; counts consumed,
          // including intentionally skipped frames, never canvas draws.
          ws.send(JSON.stringify({type:'display_ack',frame_id:m.frame_id,epoch:m.epoch,client_elapsed_ms:performance.now()}))
          if (phaseRef.current === 'connecting') setPhase('streaming')
        } catch(err) { proofRef.current.protocol_errors++; console.warn('[world] protocol error',err) }
      }

      ws.onerror = () => {
        if(wsRef.current!==ws) return
        setState((s) => ({ ...s, error: s.error ?? 'WebSocket error' }))
      }

      ws.onclose = () => {
        if(wsRef.current!==ws) return
        if(wsRef.current!==ws) return
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
          if (!intentionalCloseRef.current) openSocket(sessionIdRef.current!)
        }, delay)
      }
    },
    [clearTimers, enqueueJpegs, publishMetrics, sendControl, setPhase],
  )

  const start = useCallback(
    async (_sceneId: WorldSceneId, _prompt: string, seed?: string | null) => {
      const requestGeneration=++requestGenerationRef.current
      setActiveSeed(seed??null)
      setPhase('starting')
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
      try {
        const result=await worldApi.start(_prompt,seedRef.current)
        if(requestGeneration!==requestGenerationRef.current) {
          await worldApi.action(result.session_id,'stop');return
        }
        sessionIdRef.current=result.session_id
        seqRef.current=0
        openSocket(result.session_id)
      } catch(err) {setPhase('error');setState(s=>({...s,error:String(err)}))}
    },
    [openSocket,setPhase],
  )

  const pause = useCallback(async () => {
    if(!sessionIdRef.current) return
    const action=phaseRef.current==='paused'?'resume':'pause'
    try { await worldApi.action(sessionIdRef.current,action);setPhase(action==='pause'?'paused':'streaming') }
    catch(err) {setState(s=>({...s,error:String(err)}))}
  }, [setPhase])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimers()
    if (wsRef.current && wsRef.current.readyState < 2) {
      wsRef.current.close()
      wsRef.current = null
    }
    if(sessionIdRef.current) void worldApi.action(sessionIdRef.current,'stop').catch(err=>setState(s=>({...s,error:String(err)})))
    sessionIdRef.current = null
    document.exitPointerLock()
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
    if(!sessionIdRef.current) return
    keysRef.current.clear();mouseRef.current={dx:0,dy:0,scroll:0};queueRef.current=[]
    try {await worldApi.action(sessionIdRef.current,'reset')}
    catch(err) {setState(s=>({...s,error:String(err)}))}
  }, [])

  const reconnect = useCallback(() => {
    if(!sessionIdRef.current) {void start('facility','First-person industrial research facility',seedRef.current);return}
    intentionalCloseRef.current = false
    reconnectAttemptRef.current = 0
    if (wsRef.current && wsRef.current.readyState < 2) {
      intentionalCloseRef.current = true
      wsRef.current.close()
    }
    window.setTimeout(() => {
      intentionalCloseRef.current = false
      openSocket(sessionIdRef.current!)
    }, 100)
  }, [openSocket,start])

  // Preserve Cursor's world selector; switching is an HTTP lifecycle operation.
  const switchingRef=useRef(false)
  const switchWorld=useCallback(async(seed:string|null)=>{
    if(switchingRef.current) return
    switchingRef.current=true
    try {
      ++requestGenerationRef.current
      intentionalCloseRef.current=true
      clearTimers();keysRef.current.clear();keyHeldRef.current.clear()
      mouseRef.current={dx:0,dy:0,scroll:0};queueRef.current=[]
      wsRef.current?.close();wsRef.current=null
      const sid=sessionIdRef.current
      if(sid) await worldApi.action(sid,'stop')
      sessionIdRef.current=null
      await start('facility','First-person generated world',seed)
    } catch(err) {setPhase('error');setState(s=>({...s,error:String(err)}))}
    finally {switchingRef.current=false}
  },[clearTimers,start,setPhase])

  const requestPointerLock = useCallback(() => {
    const el = canvasElRef.current ?? stageRef.current
    const rejected=(err:unknown)=>setState(s=>({...s,error:
      `Pointer lock unavailable (${err instanceof Error ? err.name : 'browser rejection'}). Hold left mouse and drag on the video to look.`}))
    // Browsers expose both synchronous and Promise-based failure paths.
    try {
      if(!el?.isConnected) throw new Error('Video canvas is detached')
      void Promise.resolve(el.requestPointerLock()).catch(rejected)
    } catch(err) {rejected(err)}
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
      proofRef.current.key_events++
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
      if (document.pointerLockElement == null && !(e.buttons === 1 && e.target === canvasElRef.current)) return
      proofRef.current.mouse_events++
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
    const onLockError=()=>setState(s=>({...s,error:'Pointer lock rejected by this browser. Hold left mouse and drag on the video to look.'}))
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
    document.addEventListener('pointerlockerror', onLockError)
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
        document.removeEventListener('pointerlockerror', onLockError)
      window.removeEventListener('blur', onBlur)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [presentLoop])

  useEffect(() => {
    const cleanup = () => {
      ++requestGenerationRef.current
      intentionalCloseRef.current=true
      clearTimers()
      wsRef.current?.close()
      if(sessionIdRef.current) void worldApi.action(sessionIdRef.current,'stop').catch(()=>{})
      sessionIdRef.current=null
    }
    window.addEventListener('pagehide',cleanup)
    return () => {window.removeEventListener('pagehide',cleanup);cleanup()}
  },[clearTimers])

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
    switchWorld,
    activeSeed,
  }
}
