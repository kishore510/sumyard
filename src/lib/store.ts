import { useSyncExternalStore } from 'react'

/*
 * A minimal external store, read in React through useSyncExternalStore (the
 * pattern useTheme already uses). Chalkline uses Zustand for this; Sumyard's
 * few small stores don't need the dependency yet.
 */

export interface Store<T> {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      if (Object.is(next, state)) return
      state = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The store's current state. Select a primitive or a stored object, never a freshly built one. */
export function useStore<T, S = T>(store: Pick<Store<T>, 'get' | 'subscribe'>, select: (state: T) => S = (s) => s as unknown as S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}
