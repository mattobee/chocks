import { describe, expect, it } from 'vitest'
import { relativeDate } from './dates'

describe('relativeDate', () => {
  it('renders days, weeks and years in the past', () => {
    expect(relativeDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      '2 days ago',
    )
    // `numeric: 'auto'` prefers "last week" over "1 week ago" right at the boundary.
    expect(relativeDate(new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      'last week',
    )
    expect(relativeDate(new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      'last year',
    )
  })

  it('renders the future the same way, for a clock skewed the other direction', () => {
    expect(relativeDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      'in 2 days',
    )
  })

  it('falls back to the nearest unit for anything under a minute', () => {
    expect(relativeDate(new Date().toISOString())).toBe('this minute')
  })

  it('returns an empty string for a date that does not parse', () => {
    expect(relativeDate('not a date')).toBe('')
  })
})
