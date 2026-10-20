// "Are you sure?", said in plain words. Anything with money or files attached asks before it goes, and says what goes
// with it. Any part of the app can ask (the store, a screen) and wait for the answer; the box itself is drawn once, by
// components/ui/ConfirmHost.tsx. Kept outside the store, like notify.ts.

export interface ConfirmRequest {
  title: string               // "Remove the show at Fabric?"
  body?: string               // one sentence of context
  items?: string[]            // what goes with it ("its fee and deposit", "2 guests on the list")
  confirmLabel?: string       // the button, default "Remove"
  note?: string               // the last line; default "This cannot be undone." (say otherwise when it can, e.g. it goes to the trash)
}

type Handler = (request: ConfirmRequest, answer: (ok: boolean) => void) => void

let handler: Handler | null = null

/** Called by the one ConfirmHost that is on screen. */
export function onConfirm(h: Handler): () => void {
  handler = h
  return () => { if (handler === h) handler = null }
}

/** Resolves true if the person confirms, false if they cancel. Falls back to the browser's own box if the app's is not on screen. */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise(resolve => {
    if (handler) return handler(request, resolve)
    const text = [request.title, request.body, ...(request.items ?? []).map(i => `• ${i}`), request.note].filter(Boolean).join('\n')
    resolve(typeof window !== 'undefined' ? window.confirm(text) : false)
  })
}
