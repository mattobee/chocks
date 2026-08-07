import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureCode } from './feature-code'
import type { Commit, FeatureCodeMatches } from '@/lib/types'

const codeMatches = vi.fn<() => Promise<FeatureCodeMatches>>()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return { ...actual, api: { ...actual.api, codeMatches: () => codeMatches() } }
})

afterEach(() => codeMatches.mockReset())

function commit(daysAgo: number, subject = 'a commit'): Commit {
  return {
    sha: 'a'.repeat(40),
    shortSha: 'a'.repeat(7),
    author: 'Tester',
    date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    subject,
  }
}

function setup(props: Parameters<typeof FeatureCode>[0], matches?: Partial<FeatureCodeMatches>) {
  codeMatches.mockResolvedValue({ matches: [], featureLastCommit: null, ...matches })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FeatureCode {...props} />
    </QueryClientProvider>,
  )
}

describe('FeatureCode', () => {
  it('renders nothing when there is no code', () => {
    const { container } = setup({ featureId: 'auth', code: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('is a table with one row per entry, in author order', () => {
    setup({
      featureId: 'auth',
      code: [
        { path: 'src/store/format.ts' },
        { path: 'src/store/*.test.ts', kind: 'test' },
        { path: 'new-onboarding', kind: 'flag' },
      ],
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Code' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Path',
      'Matches',
      'Changed',
    ])
    // Header row plus one row per entry.
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('src/store/format.ts')).toBeInTheDocument()
    expect(screen.getByText('src/store/*.test.ts')).toBeInTheDocument()
    expect(screen.getByText('new-onboarding')).toBeInTheDocument()
  })

  it('uses distinct icons for test and flag kinds, and a default for code', () => {
    const { container } = setup({
      featureId: 'auth',
      code: [
        { path: 'src/store/format.ts' },
        { path: 'src/store/format.test.ts', kind: 'test' },
        { path: 'new-onboarding', kind: 'flag' },
      ],
    })
    expect(container.querySelector('.lucide-code')).toBeInTheDocument()
    expect(container.querySelector('.lucide-flask-conical')).toBeInTheDocument()
    expect(container.querySelector('.lucide-flag')).toBeInTheDocument()
  })

  it('gives each kind icon a text alternative, since the icon is the only place kind appears', () => {
    setup({
      featureId: 'auth',
      code: [
        { path: 'src/store/format.ts' },
        { path: 'src/store/format.test.ts', kind: 'test' },
        { path: 'new-onboarding', kind: 'flag' },
      ],
    })
    expect(screen.getByRole('img', { name: 'Code' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Test' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Feature flag' })).toBeInTheDocument()
  })

  it('makes the kind icon reachable by keyboard, so its tooltip is not mouse-only', () => {
    setup({ featureId: 'auth', code: [{ path: 'src/store/format.ts', kind: 'test' }] })
    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('tabindex', '0')
  })

  it('shows how many files a glob matched', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/store/*.test.ts' }] },
      { matches: [{ path: 'src/store/*.test.ts', count: 3, lastCommit: null }] },
    )
    expect(await screen.findByText('3 matches')).toBeInTheDocument()
  })

  it('says one match, not one matches', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/auth.ts' }] },
      { matches: [{ path: 'src/auth.ts', count: 1, lastCommit: null }] },
    )
    expect(await screen.findByText('1 match')).toBeInTheDocument()
  })

  it('marks zero matches as a broken claim, not a neutral count', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/gone.ts' }] },
      { matches: [{ path: 'src/gone.ts', count: 0, lastCommit: null }] },
    )
    const text = await screen.findByText('No matches')
    expect(text).toHaveClass('text-destructive')
  })

  it('renders no match count for a flag entry rather than a false zero', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'new-onboarding', kind: 'flag' }] },
      { matches: [{ path: 'new-onboarding', count: null, lastCommit: null }] },
    )
    expect(await screen.findByText('new-onboarding')).toBeInTheDocument()
    expect(screen.queryByText('No matches')).not.toBeInTheDocument()
    expect(screen.queryByText(/match/)).not.toBeInTheDocument()
  })
})

describe('last-changed dates', () => {
  it('shows when the feature itself last changed', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/auth.ts' }] },
      {
        matches: [{ path: 'src/auth.ts', count: 1, lastCommit: commit(10) }],
        featureLastCommit: commit(3),
      },
    )
    expect(await screen.findByText(/Feature last changed/)).toBeInTheDocument()
  })

  it('shows no date for an entry git could not date', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/auth.ts' }] },
      { matches: [{ path: 'src/auth.ts', count: 1, lastCommit: null }] },
    )
    const row = await screen.findByText('src/auth.ts')
    const cells = row.closest('tr')?.querySelectorAll('td') ?? []
    expect(cells[2]).toHaveTextContent('')
  })

  it('shows when a matched file itself last changed, so it can be read against the feature date above', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/auth.ts' }] },
      {
        matches: [{ path: 'src/auth.ts', count: 1, lastCommit: commit(1, 'feat: rework auth') }],
        featureLastCommit: commit(10, 'docs: describe auth'),
      },
    )
    expect(await screen.findByText('yesterday')).toBeInTheDocument()
  })
})
