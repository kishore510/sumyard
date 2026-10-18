import { createStore } from '@/lib/store'

/*
 * One toast at a time, with an optional Undo (generalised from Chalkline's
 * UndoToast, which was tied to diagram history). It dismisses itself after
 * the duration, pauses while focused or hovered (so nobody has to race the
 * timer to reach Undo), and every message is announced through one polite
 * live region (see Toast.tsx).
 */

export interface ToastUndo {
  run: () => void
  /** Why the action can no longer be undone (the state moved on), shown instead of running it; nothing when it can. */
  blocked?: () => string | undefined
  /** Shown and announced after undoing. Default "Undone." */
  done?: string
}

export interface Toast {
  id: number
  message: string
  undo?: ToastUndo
}

export interface ToastState {
  toast: Toast | null
  /** What the live region says; the id changes even when the text repeats. */
  announcement: { id: number; text: string }
}

export function createToastStore({ duration }: { duration: () => number }) {
  const store = createStore<ToastState>({ toast: null, announcement: { id: 0, text: '' } })
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | undefined
  let paused = false

  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const startTimer = () => {
    stopTimer()
    const id = store.get().toast?.id
    if (id === undefined || paused) return
    timer = setTimeout(() => dismiss(id), duration())
  }

  function dismiss(id?: number) {
    const { toast } = store.get()
    if (!toast || (id !== undefined && id !== toast.id)) return
    stopTimer()
    paused = false
    store.set({ ...store.get(), toast: null })
  }

  function show({ message, undo }: { message: string; undo?: ToastUndo }): number {
    const id = nextId++
    const text = undo ? `${message} Undo is available.` : message
    paused = false
    store.set({ toast: { id, message, ...(undo && { undo }) }, announcement: { id, text } })
    startTimer()
    return id
  }

  return {
    get: store.get,
    subscribe: store.subscribe,
    show,
    dismiss,
    /** Runs the current toast's undo (once), then confirms. */
    undo() {
      const undo = store.get().toast?.undo
      if (!undo) return
      undo.run()
      show({ message: undo.done ?? 'Undone.' })
    },
    pause() {
      paused = true
      stopTimer()
    },
    /** Restarts the full time: someone who looked away gets the whole duration again. */
    resume() {
      paused = false
      startTimer()
    },
  }
}

export type ToastStore = ReturnType<typeof createToastStore>
