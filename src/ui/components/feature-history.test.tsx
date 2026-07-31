import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureHistory } from './feature-history'
import type { FeatureHistory as History } from '@/ui/lib/api'

const featureHistory = vi.fn<() => Promise<History>>()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return { ...actual, api: { ...actual.api, featureHistory: () => featureHistory() } }
})

afterEach(() => featureHistory.mockReset())

function setup(history: History) {
  featureHistory.mockResolvedValue(history)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <FeatureHistory featureId="auth" />
    </QueryClientProvider>,
  )
}

const commit = {
  sha: 'abc123def456',
  shortSha: 'abc123d',
  author: 'Matt Obee',
  date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  subject: 'feat: add auth',
}

describe('uncommitted indicator', () => {
  // It changes with no user action behind it, so the change has to be announced. The
  // region must exist before it populates, or nothing is announced at all.
  it('announces politely in both states', async () => {
    setup({ commits: [commit], uncommitted: true })
    const region = await screen.findByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Uncommitted changes')
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
