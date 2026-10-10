import { useEffect, useState } from 'react'
import {
  asLiveClient,
  getMemoryMode,
  getWorldMemoryClient,
  resolveWorldMemoryClient,
} from '../services/worldMemory/worldMemoryClient'
import { getMockWorldMemoryClient } from '../services/worldMemory/mockWorldMemoryClient'
import type { WorldMemorySession } from '../types/worldMemory'

export function useWorldMemory() {
  const [client, setClient] = useState(() => getWorldMemoryClient())
  const [session, setSession] = useState<WorldMemorySession>(() => client.getSession())
  const [modeInfo, setModeInfo] = useState(() => getMemoryMode())

  useEffect(() => {
    let cancelled = false
    void resolveWorldMemoryClient().then((c) => {
      if (cancelled) return
      setClient(c)
      setModeInfo(getMemoryMode())
      setSession(c.getSession())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => client.subscribe(setSession), [client])

  const live = asLiveClient(client)

  return {
    session,
    source: client.source,
    memoryMode: modeInfo.mode,
    memoryModeReason: modeInfo.reason,
    attach: client.attach.bind(client),
    detach: client.detach.bind(client),
    saveView: () => client.saveView(),
    selectCheckpoint: (id: string | null) => client.selectCheckpoint(id),
    restoreCheckpoint: (id: string) => client.restoreCheckpoint(id),
    reviewCheckpoint: (
      id: string,
      approved: boolean,
      extra?: { reviewer?: string; reason?: string },
    ) => client.reviewCheckpoint?.(id, approved, extra) ?? Promise.resolve(),
    refreshWorldMemory: () => client.refreshWorld?.() ?? Promise.resolve(),
    noteControlHint: (hint: { keys: string[]; mouseDx: number; mouseDy: number }) => {
      if (client.source === 'live') return
      client.noteControlHint?.(hint)
    },
    requestCenterOnPlayer: () => {
      if (live) live.requestCenterOnPlayer()
      else getMockWorldMemoryClient().requestCenterOnPlayer()
    },
    consumeCenterRequest: () => client.consumeCenterRequest(),
    centerPending: () => client.centerOnPlayerRequested(),
    restoreBanner: () => live?.getRestoreBanner() ?? null,
    revalidateLive: (frameSize: { width: number; height: number } | null) =>
      resolveWorldMemoryClient({ frameSize, force: true }).then((c) => {
        setClient(c)
        setModeInfo(getMemoryMode())
      }),
  }
}
