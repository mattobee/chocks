import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeatureFilters } from './feature-filters'
import { DEFAULT_STATUSES } from '@/lib/status'
import { EMPTY_FILTERS, type TreeFilters } from '@/lib/tree'

function setup(filters: Partial<TreeFilters> = {}, tags: string[] = []) {
  const onChange = vi.fn<(next: TreeFilters) => void>()
  render(
    <FeatureFilters
      filters={{ ...EMPTY_FILTERS, ...filters }}
      statuses={DEFAULT_STATUSES}
      tags={tags}
      matchCount={null}
      onChange={onChange}
    />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('status dropdown', () => {
  it('reports checked state, since selection is not conveyed by colour alone', async () => {
    const { user } = setup({ statuses: ['released'] })
    await user.click(screen.getByRole('button', { name: /Status/ }))
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Released' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemcheckbox', { name: 'Planned' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('adds a status on click', async () => {
    const { user, onChange } = setup()
    await user.click(screen.getByRole('button', { name: /Status/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Released' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['released'] }))
  })

  it('removes a status that is already on', async () => {
    const { user, onChange } = setup({ statuses: ['released'] })
    await user.click(screen.getByRole('button', { name: /Status/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Released' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: [] }))
  })

  it('shows a count badge once statuses are selected', () => {
    setup({ statuses: ['released', 'planned'] })
    expect(screen.getByRole('button', { name: 'Status, 2 selected' })).toBeInTheDocument()
  })
})

describe('tags dropdown', () => {
  it('toggles a tag', async () => {
    const { user, onChange } = setup({}, ['ux', 'api'])
    await user.click(screen.getByRole('button', { name: /Tags/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'ux' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['ux'] }))
  })

  it('shows nothing when no tags are in use', () => {
    setup()
    expect(screen.queryByRole('button', { name: /Tags/ })).not.toBeInTheDocument()
  })
})

describe('search', () => {
  it('passes the query through', async () => {
    const { user, onChange } = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Search features' }), 'oauth')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'o' }))
  })

  it('hides the clear button when there is no query', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('shows the clear button once there is a query', () => {
    setup({ query: 'oauth' })
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('clears the query without touching status or tag filters', async () => {
    const { user, onChange } = setup({ query: 'oauth', statuses: ['planned'] })
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ query: '', statuses: ['planned'] }),
    )
  })
})

describe('Clear filters button', () => {
  it('shows once a status or tag filter is on', () => {
    setup({ statuses: ['planned'] })
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('hides when only the query is set', () => {
    setup({ query: 'oauth' })
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('clears status and tag filters but leaves the query alone', async () => {
    const { user, onChange } = setup({ query: 'oauth', statuses: ['planned'] }, ['ux'])
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onChange).toHaveBeenCalledWith({ query: 'oauth', statuses: [], tags: [] })
  })
})

describe('match count', () => {
  // Typing rewrites the tree below with no announcement otherwise. The region has to be in
  // the DOM before it populates, or the first result is never announced.
  it('lives in a status region that exists before there is a count', () => {
    setup()
    expect(screen.getByRole('status', { name: 'Search results' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Search results' })).toBeEmptyDOMElement()
  })

  it('announces the count politely', () => {
    render(
      <FeatureFilters
        filters={EMPTY_FILTERS}
        statuses={DEFAULT_STATUSES}
        tags={[]}
        matchCount={3}
        onChange={vi.fn()}
      />,
    )
    const region = screen.getByRole('status', { name: 'Search results' })
    expect(region).toHaveTextContent('3 matches')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('uses the singular for one match', () => {
    render(
      <FeatureFilters
        filters={EMPTY_FILTERS}
        statuses={DEFAULT_STATUSES}
        tags={[]}
        matchCount={1}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('status', { name: 'Search results' })).toHaveTextContent('1 match')
  })
})
