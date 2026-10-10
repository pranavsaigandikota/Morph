import { useEffect, useState } from 'react'
import { getWorldMemoryClient } from '../services/worldMemory/mockWorldMemoryClient'
import { LiveWorldMemoryClient } from '../services/worldMemory/liveWorldMemoryClient'
import { getWorldCapabilities } from '../services/worldCapabilities'
import type { WorldMemoryClient, WorldMemorySession } from '../types/worldMemory'

let liveClient: LiveWorldMemoryClient | null = null

/**
 * LIVE when the backend advertises memory_api (World Memory API v1.2); otherwise the labelled MOCK client.
 * VITE_WORLD_MEMORY_SOURCE=mock forces MOCK.
 */
export function useWorldMemory() {
  const [client, setClient] = useState<WorldMemoryClient>(() => getWorldMemoryClient())
  const [session, setSession] = useState<WorldMemorySession>(() => client.getSession())

  useEffect(() => {
    if (import.meta.env.VITE_WORLD_MEMORY_SOURCE === 'mock') return
    let cancelled = false
    void getWorldCapabilities().then((caps) => {
      if (cancelled || !caps?.memory_api) return
      liveClient = liveClient ?? new LiveWorldMemoryClient()
      setClient(liveClient)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => client.subscribe(setSession), [client])

  const withCenter = client as WorldMemoryClient & { requestCenterOnPlayer?: () => void }
  return {
    session,
    source: client.source,
    client,
    attach: client.attach.bind(client),
    detach: client.detach.bind(client),
    saveView: () => client.saveView(),
    selectCheckpoint: (id: string | null) => client.selectCheckpoint(id),
    restoreCheckpoint: (id: string) => client.restoreCheckpoint(id),
    captureAnchor: client.captureAnchor
      ? (restoreHere: boolean) => client.captureAnchor!({ restoreHere })
      : null,
    noteControlHint: (hint: { keys: string[]; mouseDx: number; mouseDy: number }) => {
      client.noteControlHint?.(hint)
    },
    requestCenterOnPlayer: () => withCenter.requestCenterOnPlayer?.(),
    consumeCenterRequest: () => client.consumeCenterRequest(),
    centerPending: () => client.centerOnPlayerRequested(),
  }
}
