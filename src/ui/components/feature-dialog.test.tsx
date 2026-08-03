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

    // The popup mounts asynchronously, so wait for the first option before asserting the
    // rest synchronously.
    await screen.findByRole('option', { name: DEFAULT_STATUSES[0]!.label })
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

describe('title validation', () => {
  it('keeps the submit button enabled so the problem can be reported', () => {
    // A disabled submit gives no reason for being unavailable, and paired with `required`
    // it meant the browser's own validation never fired either.
    setup()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('reports an empty title through the accessibility tree', async () => {
    const { user, onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: 'Create' }))

    const title = screen.getByRole('textbox', { name: 'Title' })
    expect(title).toBeInvalid()
    expect(title).toHaveAccessibleErrorMessage('Enter a title.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('moves focus to the field that needs fixing', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
  })

  it('clears the error once a title is typed', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')

    expect(screen.getByRole('textbox', { name: 'Title' })).toBeValid()
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument()
  })

  it('rejects a title that is only whitespace', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('trims the title it submits', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Sign in  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign in' }))
  })
})

describe('tags', () => {
  it('picks an existing tag from the list', async () => {
    const { user, onSubmit } = setup({ availableTags: ['ux', 'api'] })
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')
    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'ux' }))
    // Wait for the chip: choosing an option settles a render later, and closing the popup
    // before it does loses the choice.
    await screen.findByRole('button', { name: 'Remove ux' })
    // The rest of the dialog is inert while this popup, a second layer on top of the
    // dialog, is open. Escape closes it, same as a user clicking elsewhere would.
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['ux'] }))
  })

  it('offers to create a tag that is not on the list', async () => {
    const { user } = setup({ availableTags: ['ux'] })
    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'new-tag')
    expect(await screen.findByRole('option', { name: 'Create "new-tag"' })).toBeInTheDocument()
  })

  it('creates a typed tag that is not on the list', async () => {
    const { user, onSubmit } = setup({ availableTags: ['ux'] })
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')
    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'new-tag')
    await user.click(await screen.findByRole('option', { name: 'Create "new-tag"' }))
    await screen.findByRole('button', { name: 'Remove new-tag' })
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['new-tag'] }))
  })

  it('does not offer to create a tag that is already chosen', async () => {
    const { user } = setup({ availableTags: ['ux'] })
    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'ux' }))
    await user.type(screen.getByRole('combobox', { name: 'Tags' }), 'ux')

    expect(screen.queryByRole('option', { name: 'Create "ux"' })).not.toBeInTheDocument()
  })

  it('removes a chosen tag from its chip', async () => {
    const { user } = setup({ feature: feature({ tags: ['api'] }) })
    await user.click(screen.getByRole('button', { name: 'Remove api' }))
    expect(screen.queryByText('api')).not.toBeInTheDocument()
  })
})

describe('edit mode', () => {
  it('fills the form from the feature', () => {
    setup({ feature: feature({ title: 'OAuth', tags: ['api'] }) })
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('OAuth')
    expect(screen.getByText('api')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  // Description has its own editor on the feature page now, so this dialog is not a second
  // way to change it.
  it('has no description field', () => {
    setup({ feature: feature({ description: 'Notes.' }) })
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
  })

  it('submits the existing description unchanged', async () => {
    const { user, onSubmit } = setup({ feature: feature({ description: 'Notes.' }) })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: 'Notes.' }))
  })
})

describe('create mode', () => {
  it('has no description field', () => {
    setup()
    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
  })

  it('creates with an empty description', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Sign in')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: '' }))
  })
})
