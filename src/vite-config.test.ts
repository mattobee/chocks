import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '../vite.config'

describe('Vite API proxy origin', () => {
  it('recognises requests from the Vite origin', () => {
    expect(isSameOrigin('http://192.168.1.20:5173', '192.168.1.20:5173')).toBe(true)
  })

  it('does not trust a cross-origin request', () => {
    expect(isSameOrigin('https://attacker.example', 'localhost:5173')).toBe(false)
  })

  it('does not trust a malformed origin', () => {
    expect(isSameOrigin('not a url', 'localhost:5173')).toBe(false)
  })
})
