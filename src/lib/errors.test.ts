import { describe, expect, it } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  it('uses the message of an Error', () => {
    expect(describeError(new Error('EACCES: permission denied'))).toBe('EACCES: permission denied')
  })

  it('describes what was thrown when it is not an Error', () => {
    expect(describeError('just a string')).toBe('just a string')
    expect(describeError(404)).toBe('404')
  })

  it('falls back rather than reporting nothing useful', () => {
    // An Error with no message, or an object that stringifies to nothing, would otherwise
    // reach the UI as an empty toast.
    expect(describeError(new Error(''))).toBe('Unknown error')
    expect(describeError({})).toBe('Unknown error')
    expect(describeError(undefined)).toBe('undefined')
  })
})
