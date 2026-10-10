import { useEffect, useRef } from 'react'

const TRACKED = new Set(['w', 'a', 's', 'd'])

export function useKeyboardControls(enabled: boolean) {
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) {
      keysRef.current.clear()
      return
    }

    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!TRACKED.has(k)) return
      e.preventDefault()
      keysRef.current.add(k)
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!TRACKED.has(k)) return
      keysRef.current.delete(k)
    }
    const blur = () => keysRef.current.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      keysRef.current.clear()
    }
  }, [enabled])

  return keysRef
}
