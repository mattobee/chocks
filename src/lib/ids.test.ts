import { describe, expect, it } from 'vitest'
import {
  featureKey,
  isValidId,
  isValidUid,
  joinId,
  parentOf,
  slugify,
  slugOf,
  slugFromKey,
  uidFromKey,
} from './ids'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('OAuth Providers')).toBe('oauth-providers')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Sign in / sign up (v2)!')).toBe('sign-in-sign-up-v2')
  })

  it('strips accents', () => {
    expect(slugify('Café Münster')).toBe('cafe-munster')
  })

  it('falls back for input that slugifies to nothing', () => {
    expect(slugify('!!!')).toBe('feature')
    expect(slugify('日本語')).toBe('feature')
  })

  it('caps length', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
})

describe('id helpers', () => {
  it('derives the parent from the path', () => {
    expect(parentOf('auth/oauth/github')).toBe('auth/oauth')
    expect(parentOf('auth')).toBe('')
  })

  it('derives the slug from the path', () => {
    expect(slugOf('auth/oauth/github')).toBe('github')
    expect(slugOf('auth')).toBe('auth')
  })

  it('joins ids', () => {
    expect(joinId('auth/oauth', 'github')).toBe('auth/oauth/github')
    expect(joinId('', 'auth')).toBe('auth')
  })
})

describe('isValidId', () => {
  it('accepts ordinary nested ids', () => {
    expect(isValidId('auth')).toBe(true)
    expect(isValidId('auth/oauth/github')).toBe(true)
    expect(isValidId('v1.2_beta-x')).toBe(true)
  })

  it('rejects traversal attempts', () => {
    // These arrive over HTTP and become filesystem paths, so this is a security boundary.
    expect(isValidId('../secrets')).toBe(false)
    expect(isValidId('auth/../../etc/passwd')).toBe(false)
    expect(isValidId('auth/..')).toBe(false)
    expect(isValidId('..')).toBe(false)
  })

  it('rejects absolute and drive-qualified paths', () => {
    expect(isValidId('/etc/passwd')).toBe(false)
    expect(isValidId('C:/Windows')).toBe(false)
    expect(isValidId('\\\\server\\share')).toBe(false)
  })

  it('rejects backslashes and null bytes', () => {
    expect(isValidId('auth\\oauth')).toBe(false)
    expect(isValidId('auth\0')).toBe(false)
  })

  it('rejects empty, uppercase and leading-dot segments', () => {
    expect(isValidId('')).toBe(false)
    expect(isValidId('auth//oauth')).toBe(false)
    expect(isValidId('Auth')).toBe(false)
    expect(isValidId('.hidden')).toBe(false)
  })

  it('rejects absurdly long ids', () => {
    expect(isValidId('a/'.repeat(300))).toBe(false)
  })
})

describe('isValidUid', () => {
  it('accepts a generated uid', () => {
    expect(isValidUid('a1b2c3d4e5')).toBe(true)
  })

  it('rejects the wrong shape', () => {
    expect(isValidUid('')).toBe(false)
    expect(isValidUid('abc')).toBe(false)
    expect(isValidUid('a1b2c3d4e5f')).toBe(false)
    expect(isValidUid('A1B2C3D4E5')).toBe(false)
    // Must start with a letter, so YAML never reads it as a number.
    expect(isValidUid('1234567890')).toBe(false)
    expect(isValidUid('9543769647')).toBe(false)
    // Non-hex characters: a real slug segment must never pass as a uid.
    expect(isValidUid('providers')).toBe(false)
    expect(isValidUid(undefined)).toBe(false)
    expect(isValidUid(42)).toBe(false)
  })
})

describe('featureKey and uidFromKey', () => {
  it('builds a readable key ending in the uid', () => {
    expect(featureKey({ id: 'auth/oauth-providers', uid: 'a1b2c3d4e5' })).toBe(
      'oauth-providers~a1b2c3d4e5',
    )
  })

  it('round-trips the uid back out', () => {
    const key = featureKey({ id: 'auth/oauth-providers', uid: 'a1b2c3d4e5' })
    expect(uidFromKey(key)).toBe('a1b2c3d4e5')
    expect(slugFromKey(key)).toBe('oauth-providers')
  })

  it('recovers the uid even when the slug is full of hyphens', () => {
    const key = featureKey({ id: 'a/sign-in-and-sign-up-v2', uid: 'deadbeef01' })
    expect(uidFromKey(key)).toBe('deadbeef01')
    expect(slugFromKey(key)).toBe('sign-in-and-sign-up-v2')
  })

  it('never mistakes a slug segment for a uid', () => {
    // The bug this separator exists to prevent: `providers` is a valid slug word.
    expect(uidFromKey('oauth-providers')).toBeNull()
    expect(slugFromKey('oauth-providers')).toBe('oauth-providers')
  })

  it('falls back to a bare slug when the feature has no uid yet', () => {
    expect(featureKey({ id: 'auth/oauth', uid: '' })).toBe('oauth')
  })

  it('returns null for a key carrying no usable uid', () => {
    expect(uidFromKey('oauth')).toBeNull()
    expect(uidFromKey('')).toBeNull()
    expect(uidFromKey('oauth~nothex')).toBeNull()
  })
})
