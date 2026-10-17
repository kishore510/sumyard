import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* Small helpers for component tests (happy-dom). Not app code. */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export function mount(node: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  let root: Root | undefined
  act(() => {
    root = createRoot(host)
    root.render(node)
  })
  return {
    host,
    rerender: (next: ReactNode) => act(() => root!.render(next)),
    unmount: () => {
      act(() => root!.unmount())
      host.remove()
    },
  }
}

/** Types into a React-controlled input as a person would (sets the value, fires input). */
export function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export const click = (element: Element | null | undefined) => {
  if (!element) throw new Error('nothing to click')
  act(() => (element as HTMLElement).click())
}

export const byText = (root: ParentNode, selector: string, text: string | RegExp) =>
  [...root.querySelectorAll(selector)].find((el) =>
    typeof text === 'string' ? el.textContent?.trim() === text : text.test(el.textContent ?? ''),
  )
