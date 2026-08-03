import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeatureRow, type FeatureRowProps } from './feature-row'
import { DEFAULT_STATUSES } from '@/lib/status'
import { makeFeature, renderWithRouter } from '@/ui/test-utils'

async function setup(overrides: Partial<FeatureRowProps> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onAddChild: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const feature = overrides.feature ?? makeFeature({ title: 'Auth' })

  await renderWithRouter(
    <DndContext>
      <SortableContext items={[feature.id]}>
        <ul>
          <FeatureRow
            feature={feature}
            statuses={DEFAULT_STATUSES}
            depth={0}
            hasChildren={false}
            expanded={false}
            matched
            filtering={false}
            uncommitted={false}
            {...handlers}
            {...overrides}
          />
        </ul>
      </SortableContext>
    </DndContext>,
  )

  return { ...handlers, user: userEvent.setup() }
}

describe('row menu', () => {
  // Base UI's Menu.Item takes onClick, not onSelect. Using onSelect typechecks, because it
  // is a real DOM attribute, but nothing ever fires. Every item here was dead once.
  it.each([
    ['Edit…', 'onEdit'],
    ['Add sub-feature', 'onAddChild'],
    ['Delete…', 'onDelete'],
  ] as const)('runs %s', async (label, handler) => {
    const handlers = await setup()
    await handlers.user.click(screen.getByRole('button', { name: 'Actions for Auth' }))
    await handlers.user.click(await screen.findByRole('menuitem', { name: label }))
    expect(handlers[handler]).toHaveBeenCalled()
  })

  // Renaming is Edit's job now, not a second path on the row.
  it('has no Rename item', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Auth' }))
    await screen.findByRole('menuitem', { name: 'Edit…' })
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument()
  })
})

describe('status', () => {
  // Read-only on the row: changing it goes through Edit now, not a control here.
  it('shows the configured label', async () => {
    await setup({ feature: makeFeature({ title: 'Auth', status: 'pre-release' }) })
    expect(screen.getByText('Pre-release')).toBeInTheDocument()
  })

  it('renders a status the config does not define, rather than blanking', async () => {
    await setup({ feature: makeFeature({ title: 'Auth', status: 'in-beta' }) })
    expect(screen.getByText('In beta')).toBeInTheDocument()
  })
})

describe('accessible names', () => {
  // These controls are icon-only, so their names exist solely in the accessibility tree.
  // Nothing visual would reveal a regression.
  it('names every icon control', async () => {
    await setup({ hasChildren: true })
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Auth' })).toBeInTheDocument()
  })

  it('reflects expansion state', async () => {
    await setup({ hasChildren: true, expanded: true })
    const toggle = screen.getByRole('button', { name: 'Collapse' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('hides the disclosure from assistive tech when there are no children', async () => {
    await setup({ hasChildren: false })
    expect(screen.queryByRole('button', { name: /Expand|Collapse/ })).not.toBeInTheDocument()
  })

  it('links the title to the feature page', async () => {
    await setup()
    expect(screen.getByRole('link', { name: 'Auth' })).toHaveAttribute('href', '/f/auth~a1b2c3d4e5')
  })
})

describe('uncommitted changes', () => {
  it('shows a marker next to the title when the feature has unsaved changes', async () => {
    await setup({ uncommitted: true })
    expect(screen.getByRole('img', { name: 'Uncommitted changes' })).toBeInTheDocument()
  })

  it('shows no marker for a committed feature', async () => {
    await setup({ uncommitted: false })
    expect(screen.queryByRole('img', { name: 'Uncommitted changes' })).not.toBeInTheDocument()
  })
})
