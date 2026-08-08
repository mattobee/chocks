import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureHistory } from './feature-history'
import type { FeatureHistory as History } from '@/lib/types'
import { DEFAULT_STATUSES } from '@/lib/status'

const featureHistory = vi.fn<() => Promise<History>>()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return { ...actual, api: { ...actual.api, featureHistory: () => featureHistory() } }
})

afterEach(() => featureHistory.mockReset())

function setup(history: Omit<History, 'tags'> & Partial<Pick<History, 'tags'>>) {
  featureHistory.mockResolvedValue({ ...history, tags: history.tags ?? [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FeatureHistory featureId="auth" statuses={DEFAULT_STATUSES} />
    </QueryClientProvider>,
  )
}

const commit = {
  sha: 'abc123def456',
  shortSha: 'abc123d',
  author: 'Matt Obee',
  date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  subject: 'feat: add auth',
  event: 'updated' as const,
}

describe('uncommitted indicator', () => {
  // It changes with no user action behind it, so the change has to be announced. The
  // region must exist before it populates, or nothing is announced at all.
  it('announces politely in both states', async () => {
    setup({ commits: [commit], uncommitted: true })
    const region = await screen.findByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Modified')
  })

  it('still has a region, and readable text, once committed', async () => {
    setup({ commits: [commit], uncommitted: false })
    const region = await screen.findByRole('status')
    expect(region).toHaveTextContent('All changes committed')
  })
})

describe('commits', () => {
  it('lists subject, author and short sha', async () => {
    setup({ commits: [commit], uncommitted: false })
    expect(await screen.findByText('feat: add auth')).toBeInTheDocument()
    expect(screen.getByText('Matt Obee')).toBeInTheDocument()
    expect(screen.getByText('abc123d')).toBeInTheDocument()
  })

  it('links the sha when the server resolves a forge URL', async () => {
    setup({
      commits: [{ ...commit, url: 'https://gitlab.com/acme/widgets/-/commit/abc123def456' }],
      uncommitted: false,
    })
    const link = await screen.findByRole('link', { name: 'abc123d' })
    expect(link).toHaveAttribute('href', 'https://gitlab.com/acme/widgets/-/commit/abc123def456')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('marks the commit that created the feature', async () => {
    setup({ commits: [{ ...commit, event: 'created' }], uncommitted: false })
    const row = (await screen.findByText('First added to Chocks')).closest('li')
    expect(row).not.toHaveTextContent('feat: add auth')
    expect(row?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the initial status on the creation commit', async () => {
    setup({
      commits: [{ ...commit, event: 'created', statusChange: { to: 'planned' } }],
      uncommitted: false,
    })
    const row = (await screen.findByText('First added to Chocks')).closest('li')
    expect(row).toHaveTextContent('as')
    expect(row).toHaveTextContent('Planned')
    expect(row).not.toHaveTextContent('Initial status')
  })

  it('shows a status transition in text and badges', async () => {
    setup({
      commits: [{ ...commit, statusChange: { from: 'planned', to: 'released' } }],
      uncommitted: false,
    })
    const row = (await screen.findByText('Status changed from')).closest('li')
    expect(row).toHaveTextContent('Status changed from')
    expect(row).toHaveTextContent('Planned')
    expect(row).toHaveTextContent('to')
    expect(row).toHaveTextContent('Released')
  })

  it('keeps an unknown status visible', async () => {
    setup({
      commits: [{ ...commit, statusChange: { from: 'experimental', to: 'released' } }],
      uncommitted: false,
    })
    const unknown = await screen.findByText('Experimental')
    expect(unknown.querySelector('svg')).toHaveClass('fill-muted-foreground')
  })

  it('places a git tag between commits according to its date', async () => {
    const older = { ...commit, sha: 'older', date: '2026-08-01T00:00:00.000Z', subject: 'Older' }
    const newer = { ...commit, sha: 'newer', date: '2026-08-03T00:00:00.000Z', subject: 'Newer' }
    setup({
      commits: [newer, older],
      tags: [{ name: 'v1.2.0', date: '2026-08-02T00:00:00.000Z', position: 'only' }],
      uncommitted: false,
    })
    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Newer'),
      expect.stringContaining('v1.2.0'),
      expect.stringContaining('Older'),
    ])
  })

  it('labels first and current release events', async () => {
    setup({
      commits: [commit],
      tags: [
        { name: 'v2.0.0', date: '2026-08-03T00:00:00.000Z', position: 'current' },
        { name: 'v1.0.0', date: '2026-08-01T00:00:00.000Z', position: 'first' },
      ],
      uncommitted: false,
    })
    expect(await screen.findByText('Current version shipped in')).toBeInTheDocument()
    expect(screen.getByText('First shipped in')).toBeInTheDocument()
  })

  it('shows when the latest change is unreleased', async () => {
    setup({
      commits: [commit],
      tags: [{ date: commit.date, position: 'unreleased' }],
      uncommitted: false,
    })
    expect(await screen.findByText('Not yet in a release')).toBeInTheDocument()
  })

  it('puts creation before release state when their timestamps match', async () => {
    setup({
      commits: [{ ...commit, event: 'created' }],
      tags: [{ date: commit.date, position: 'unreleased' }],
      uncommitted: false,
    })
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Not yet in a release')
    expect(items[1]).toHaveTextContent('First added to Chocks')
  })

  it('gives the date a machine readable value as well as a relative one', async () => {
    setup({ commits: [commit], uncommitted: false })
    const time = (await screen.findByText('feat: add auth')).closest('li')?.querySelector('time')
    expect(time).toHaveAttribute('datetime', commit.date)
    expect(time).toHaveTextContent('2 days ago')
  })

  it('explains an uncommitted file rather than showing an empty list', async () => {
    setup({ commits: [], uncommitted: true })
    expect(await screen.findByText(/Not committed yet/)).toBeInTheDocument()
  })
})

describe('when git cannot answer', () => {
  it.each([
    ['not-a-repo', /Not a git repository/],
    ['git-missing', /git is not on the PATH/],
    ['failed', /Could not read history/],
  ] as const)('explains %s', async (reason, text) => {
    setup({ commits: [], uncommitted: false, unavailable: reason })
    expect(await screen.findByText(text)).toBeInTheDocument()
  })
})
