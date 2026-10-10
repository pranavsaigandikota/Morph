import { useEffect, useState } from 'react'
import {
  getMockWorldMemoryClient,
  getWorldMemoryClient,
} from '../services/worldMemory/mockWorldMemoryClient'
import type { WorldMemorySession } from '../types/worldMemory'

export function useWorldMemory() {
  const client = getWorldMemoryClient()
  const [session, setSession] = useState<WorldMemorySession>(() => client.getSession())

  useEffect(() => client.subscribe(setSession), [client])

  return {
    session,
    source: client.source,
    attach: client.attach.bind(client),
    detach: client.detach.bind(client),
    saveView: () => client.saveView(),
    selectCheckpoint: (id: string | null) => client.selectCheckpoint(id),
    restoreCheckpoint: (id: string) => client.restoreCheckpoint(id),
    noteControlHint: (hint: { keys: string[]; mouseDx: number; mouseDy: number }) => {
      client.noteControlHint?.(hint)
    },
    requestCenterOnPlayer: () => {
      getMockWorldMemoryClient().requestCenterOnPlayer()
    },
    consumeCenterRequest: () => client.consumeCenterRequest(),
    centerPending: () => client.centerOnPlayerRequested(),
  }
}
