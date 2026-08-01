import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUndoShortcut } from './use-undo-shortcut'
import { UndoContext, type UndoContextValue } from '@/ui/lib/undo-context'

const undo = vi.fn()
const redo = vi.fn()

afterEach(() => vi.resetAllMocks())

function Shortcuts() {
  useUndoShortcut()
  return null
}

function setup(extra?: React.ReactNode) {
  const value: UndoContextValue = { record: vi.fn(), undo, redo, canUndo: true, canRedo: true }
  render(
    // Pinned to mac so `Mod` resolves to Meta. Left to auto-detection it would resolve to
    // Control under jsdom, and every test below would pass without the hotkey ever firing.
    <HotkeysProvider defaultOptions={{ hotkey: { platform: 'mac' } }}>
      <UndoContext.Provider value={value}>
        <Shortcuts />
        <button type="button">Somewhere to focus</button>
        {extra}
      </UndoContext.Provider>
    </HotkeysProvider>,
  )
  return userEvent.setup()
}

describe('undo shortcut', () => {
  it('undoes on Mod+Z', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Somewhere to focus' }))

    await user.keyboard('{Meta>}z{/Meta}')

    expect(undo).toHaveBeenCalledTimes(1)
  })

  it('redoes on Mod+Shift+Z', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Somewhere to focus' }))

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')

    expect(redo).toHaveBeenCalledTimes(1)
    expect(undo).not.toHaveBeenCalled()
  })

  it('leaves Mod+Z alone while the user is typing', async () => {
    // The library lets Ctrl/Meta shortcuts through inputs by default. Inside the rename
    // box, Cmd+Z has to mean undo my typing, which the browser already does.
    const user = setup(<input aria-label="Rename" defaultValue="Auth" />)
    await user.click(screen.getByRole('textbox', { name: 'Rename' }))

    await user.keyboard('{Meta>}z{/Meta}')

    expect(undo).not.toHaveBeenCalled()
  })

  it('leaves Mod+Z alone in a textarea', async () => {
    const user = setup(<textarea aria-label="Description" defaultValue="Notes" />)
    await user.click(screen.getByRole('textbox', { name: 'Description' }))

    await user.keyboard('{Meta>}z{/Meta}')

    expect(undo).not.toHaveBeenCalled()
  })

  it('does nothing while a dialog is open', async () => {
    // Focus is trapped on the dialog's buttons, which are not input-like, so without the
    // guard undo would rearrange the tree behind a confirmation nobody has answered.
    const user = setup(
      <div role="alertdialog" aria-label="Delete?" data-open="">
        <button type="button">Cancel</button>
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.keyboard('{Meta>}z{/Meta}')

    expect(undo).not.toHaveBeenCalled()
  })

  it('still works once a dialog has closed but is left in the DOM', async () => {
    // Base UI leaves it mounted carrying data-closed. Blocking on presence alone meant
    // undo stopped working for the rest of the session after the first delete.
    const user = setup(
      <div role="alertdialog" aria-label="Delete?" data-closed="">
        <button type="button">Cancel</button>
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Somewhere to focus' }))

    await user.keyboard('{Meta>}z{/Meta}')

    expect(undo).toHaveBeenCalledTimes(1)
  })
})
