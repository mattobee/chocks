import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(cleanup)

// Base UI positions popups with these, and jsdom implements neither.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// next-themes and the colour switcher read this.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof globalThis.matchMedia
}

/**
 * Base UI popups need browser APIs jsdom does not implement.
 *
 * Without these the select and menu triggers appear to do nothing, which reads like a bug
 * in the component rather than a gap in the environment. Anything that depends on real
 * layout still belongs in the Playwright suite.
 */
const proto = Element.prototype as unknown as Record<string, unknown>

proto.setPointerCapture ??= vi.fn()
proto.releasePointerCapture ??= vi.fn()
proto.hasPointerCapture ??= (() => false) as unknown
proto.checkVisibility ??= (() => true) as unknown
proto.getAnimations ??= (() => []) as unknown

const html = HTMLElement.prototype as unknown as Record<string, unknown>
html.showPopover ??= vi.fn()
html.hidePopover ??= vi.fn()
html.togglePopover ??= vi.fn()

// TanStack Router restores scroll position on navigation; jsdom has no scrolling.
globalThis.scrollTo ??= vi.fn() as unknown as typeof globalThis.scrollTo
