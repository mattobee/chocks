import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteFeatureDialog } from './delete-feature-dialog'
import { makeFeature } from '@/ui/test-utils'
import type { Feature } from '@/lib/types'

function setup(features: Feature[], pending: Feature | null = features[0] ?? null) {
  const onConfirm = vi.fn<(feature: Feature) => void>()
  const onOpenChange = vi.fn<(open: boolean) => void>()
  render(
    <DeleteFeatureDialog
      feature={pending}
      features={features}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, onOpenChange, user: userEvent.setup() }
}

describe('DeleteFeatureDialog', () => {
  it('stays shut when nothing is pending', () => {
    setup([makeFeature()], null)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('warns that the whole subtree goes with it', () => {
    setup([
      makeFeature({ id: 'auth', title: 'Auth' }),
      makeFeature({ id: 'auth/oauth', parent: 'auth', uid: 'b1b2c3d4e5' }),
      makeFeature({ id: 'auth/oauth/github', parent: 'auth/oauth', uid: 'c1b2c3d4e5' }),
    ])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2 nested features')
  })

  it('counts one descendant in the singular', () => {
    setup([
      makeFeature({ id: 'auth', title: 'Auth' }),
      makeFeature({ id: 'auth/oauth', parent: 'auth', uid: 'b1b2c3d4e5' }),
    ])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1 nested feature.')
  })

  it('does not mention descendants for a leaf', () => {
    setup([makeFeature()])
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('nested')
  })

  it('dismisses itself before confirming, since Base UI does not', async () => {
    const feature = makeFeature()
    const { onConfirm, onOpenChange, user } = setup([feature])

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).toHaveBeenCalledWith(feature)
  })

  it('cancels without deleting', async () => {
    const { onConfirm, user } = setup([makeFeature()])

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
