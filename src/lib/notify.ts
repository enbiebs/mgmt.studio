// A tiny way for any part of the app to say "this just happened" (and offer a button), shown as a
// toast by components/ui/Toaster.tsx. Kept outside the store so the store's actions can call it
// without anything needing to subscribe to it.

export interface Notice {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

type Listener = (notice: Notice) => void

const listeners = new Set<Listener>()
let counter = 0

export function notify(text: string, action?: Notice['action']): void {
  const notice: Notice = { id: ++counter, text, action }
  listeners.forEach(l => l(notice))
}

export function onNotice(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
