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

describe('status chips', () => {
  it('reports pressed state, since selection is not conveyed by colour alone', () => {
    setup({ statuses: ['released'] })
    expect(screen.getByRole('button', { name: 'Released' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('adds a status on click', async () => {
    const { user, onChange } = setup()
    await user.click(screen.getByRole('button', { name: 'Released' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: ['released'] }))
  })

  it('removes a status that is already on', async () => {
    const { user, onChange } = setup({ statuses: ['released'] })
    await user.click(screen.getByRole('button', { name: 'Released' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statuses: [] }))
  })
})

describe('tag chips', () => {
  it('toggles a tag', async () => {
    const { user, onChange } = setup({}, ['ux', 'api'])
    await user.click(screen.getByRole('button', { name: 'ux' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['ux'] }))
  })

  it('shows nothing when no tags are in use', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'ux' })).not.toBeInTheDocument()
  })
})

describe('search', () => {
  it('passes the query through', async () => {
    const { user, onChange } = setup()
    await user.type(screen.getByRole('searchbox', { name: 'Search features' }), 'oauth')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'o' }))
  })

  it('offers Clear only once something is filtered', async () => {
    const { user, onChange } = setup({ query: 'oauth', statuses: ['idea'] })
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith({ query: '', statuses: [], tags: [] })
  })

  it('hides Clear when nothing is filtered', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
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
