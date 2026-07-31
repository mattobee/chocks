import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeatureDialog, type FeatureDraft } from './feature-dialog'
import { DEFAULT_STATUSES } from '@/lib/status'
import type { Feature } from '@/lib/types'

function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'auth',
    uid: 'a1b2c3d4e5',
    parent: '',
    title: 'Auth',
    description: '',
    status: 'planned',
    tags: [],
    sort: 'a0',
    ...overrides,
  }
}

function setup(props: Partial<Parameters<typeof FeatureDialog>[0]> = {}) {
  const onSubmit = vi.fn<(draft: FeatureDraft) => void>()
  render(
    <FeatureDialog
      open
      onOpenChange={vi.fn()}
      availableTags={[]}
      statuses={DEFAULT_STATUSES}
      busy={false}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('status select', () => {
  it('shows the label, not the underlying id', async () => {
    // Base UI's SelectValue renders the raw value unless told otherwise, so this trigger
    // showed "pre-release" instead of "Pre-release".
    setup({ feature: feature({ status: 'pre-release' }) })
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Pre-release')
  })

  it('offers every configured status by label', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('combobox', { name: 'Status' }))

    for (const status of DEFAULT_STATUSES) {
      expect(screen.getByRole('option', { name: status.label })).toBeInTheDocument()
    }
  })

  it('submits the id of the chosen status', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Released' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'released' }))
  })
})

describe('tags', () => {
  it('parses a comma separated list', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')
    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'ux, api ,, ux')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    // Blanks and duplicates dropped, order preserved.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['ux', 'api'] }))
  })

  it('toggles an existing tag on and off', async () => {
    const { user } = setup({ availableTags: ['ux', 'api'] })
    const ux = screen.getByRole('button', { name: 'ux' })

    expect(ux).toHaveAttribute('aria-pressed', 'false')
    await user.click(ux)
    expect(screen.getByRole('button', { name: 'ux' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('edit mode', () => {
  it('fills the form from the feature', () => {
    setup({ feature: feature({ title: 'OAuth', description: 'Notes.', tags: ['api'] }) })
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('OAuth')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('Notes.')
    expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveValue('api')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})
