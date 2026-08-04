import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './app-shell'
import { renderWithRouter } from '@/ui/test-utils'
import { DEFAULT_STATUSES } from '@/lib/status'
import type { UncommittedFeatures, Workspace } from '@/lib/types'

const workspace = vi.fn<() => Promise<Workspace>>()
const uncommitted = vi.fn<() => Promise<UncommittedFeatures>>()

vi.mock('@/ui/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, workspace: () => workspace(), uncommitted: () => uncommitted() },
  }
})

afterEach(() => {
  workspace.mockReset()
  uncommitted.mockReset()
})

async function setup(overrides: Partial<Workspace> = {}, uncommittedIds: string[] = []) {
  workspace.mockResolvedValue({
    root: '/repo/.chocks',
    name: 'chocks',
    version: '1.2.3',
    releaseUrl: 'https://github.com/mattobee/chocks/releases/tag/v1.2.3',
    config: { statuses: DEFAULT_STATUSES },
    ...overrides,
  })
  uncommitted.mockResolvedValue({ ids: uncommittedIds })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await renderWithRouter(
    <QueryClientProvider client={client}>
      <AppShell>
        <p>Page content</p>
      </AppShell>
    </QueryClientProvider>,
  )
}

describe('version in the footer', () => {
  it('links the running version to its release notes', async () => {
    await setup()

    // The name says where it goes, so it isn't mistaken for a second link home.
    const link = await screen.findByRole('link', { name: 'chocks 1.2.3 release notes' })
    expect(link).toHaveAttribute('href', 'https://github.com/mattobee/chocks/releases/tag/v1.2.3')
  })

  it('sits in a contentinfo landmark, so it is skippable', async () => {
    await setup()

    const footer = screen.getByRole('contentinfo')
    await waitFor(() => expect(footer).toHaveTextContent('chocks 1.2.3'))
  })

  it('shows the version as plain text when there is nowhere to link', async () => {
    await setup({ releaseUrl: '' })

    await waitFor(() => expect(screen.getByRole('contentinfo')).toHaveTextContent('chocks 1.2.3'))
    expect(screen.queryByRole('link', { name: /chocks 1\.2\.3/ })).not.toBeInTheDocument()
  })

  it('says nothing at all when the version is unknown', async () => {
    await setup({ version: '', releaseUrl: '' })

    await waitFor(() => expect(screen.getByText('Page content')).toBeInTheDocument())
    expect(screen.getByRole('contentinfo')).toHaveTextContent('')
  })
})

describe('uncommitted changes badge in the header', () => {
  it('shows up when any feature has unsaved changes', async () => {
    await setup({}, ['auth'])

    expect(await screen.findByText('Uncommitted changes')).toBeInTheDocument()
  })

  it('stays hidden when every feature is committed', async () => {
    await setup()

    await waitFor(() => expect(screen.getByText('Page content')).toBeInTheDocument())
    expect(screen.queryByText('Uncommitted changes')).not.toBeInTheDocument()
  })
})
