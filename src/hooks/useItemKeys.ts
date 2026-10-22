import { useState } from 'react'

/*
 * Keys for a list of items a person adds, removes and restores (benefit
 * items, car options), so each item's boxes stay with it. Shared by the
 * take-home page's item lists (U9) and the car decision page's options.
 */

/** Keys for a list's items that stay with each item as others are added, removed or restored. Held by the page only, never stored. */
export function useItemKeys(count: number) {
  const [state, setState] = useState(() => ({ next: count, keys: Array.from({ length: count }, (_, i) => i) }))
  let { keys } = state
  if (keys.length !== count) {
    // The list changed from outside (an Undo after the page was left): start the keys afresh.
    keys = Array.from({ length: count }, (_, i) => state.next + i)
    setState({ next: state.next + count, keys })
  }
  const key = state.next
  return {
    keys,
    /** Adds a key at `index` (the end for a new item) and returns it. */
    inserted: (index: number) => {
      setState((s) => ({ next: s.next + 1, keys: [...s.keys.slice(0, index), s.next, ...s.keys.slice(index)] }))
      return key
    },
    removed: (index: number) => setState((s) => ({ ...s, keys: s.keys.filter((_, i) => i !== index) })),
  }
}
