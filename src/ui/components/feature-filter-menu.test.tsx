import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeatureFilterMenu } from './feature-filter-menu'
import { DEFAULT_STATUSES } from '@/lib/status'
import { EMPTY_FILTERS, type TreeFilters } from '@/lib/tree'

function setup(filters: TreeFilters = EMPTY_FILTERS) {
  const onChange = vi.fn()
  render(
    <FeatureFilterMenu
      statuses={DEFAULT_STATUSES}
      tags={['api']}
      filters={filters}
      onChange={onChange}
    />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('importance filter', () => {
  async function openImportance(user: ReturnType<typeof userEvent.setup>) {
    const trigger = screen.getByRole('button', { name: /Filter/ })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    const importance = await screen.findByRole('menuitem', { name: 'Importance' })
    importance.focus()
    await user.keyboard('{ArrowRight}')
  }

  it('offers high, normal and low importance', async () => {
    const { user } = setup()
    await openImportance(user)

    expect(await screen.findByRole('menuitemcheckbox', { name: 'High' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Normal' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Low' })).toBeInTheDocument()
  })

  it('adds an importance filter and counts it as active', async () => {
    const { onChange, user } = setup()
    await openImportance(user)
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'High' }))

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, importances: ['high'] })
  })

  it('clears importance with the other filters', async () => {
    const { onChange, user } = setup({ ...EMPTY_FILTERS, importances: ['low'] })
    const trigger = screen.getByRole('button', { name: 'Filter, 1 active' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }))

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS)
  })
})
