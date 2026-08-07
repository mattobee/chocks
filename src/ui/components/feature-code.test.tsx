import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureCode } from './feature-code'
import type { FeatureCodeMatches } from '@/lib/types'

const codeMatches = vi.fn<() => Promise<FeatureCodeMatches>>()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return { ...actual, api: { ...actual.api, codeMatches: () => codeMatches() } }
})

afterEach(() => codeMatches.mockReset())

function setup(props: Parameters<typeof FeatureCode>[0], matches?: FeatureCodeMatches) {
  codeMatches.mockResolvedValue(matches ?? { matches: [] })
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

  it('keeps author order and renders each path as plain text, not a link', () => {
    setup({
      featureId: 'auth',
      code: [
        { path: 'src/store/format.ts' },
        { path: 'src/store/*.test.ts', kind: 'test' },
        { path: 'new-onboarding', kind: 'flag' },
      ],
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Code' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
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

  it('shows how many files a glob matched', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/store/*.test.ts' }] },
      { matches: [{ path: 'src/store/*.test.ts', count: 3 }] },
    )
    expect(await screen.findByText('3 matches')).toBeInTheDocument()
  })

  it('says one match, not one matches', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/auth.ts' }] },
      { matches: [{ path: 'src/auth.ts', count: 1 }] },
    )
    expect(await screen.findByText('1 match')).toBeInTheDocument()
  })

  it('marks zero matches as a broken claim, not a neutral count', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'src/gone.ts' }] },
      { matches: [{ path: 'src/gone.ts', count: 0 }] },
    )
    const badge = await screen.findByText('No matches')
    expect(badge.closest('[data-slot="badge"]')).toHaveAttribute('data-variant', 'destructive')
  })

  it('renders no badge for a flag entry rather than a false zero', async () => {
    setup(
      { featureId: 'auth', code: [{ path: 'new-onboarding', kind: 'flag' }] },
      { matches: [{ path: 'new-onboarding', count: null }] },
    )
    expect(await screen.findByText('new-onboarding')).toBeInTheDocument()
    expect(screen.queryByText('No matches')).not.toBeInTheDocument()
    expect(screen.queryByText(/match/)).not.toBeInTheDocument()
  })
})
