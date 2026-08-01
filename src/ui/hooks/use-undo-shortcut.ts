import { useHotkey } from '@tanstack/react-hotkeys'
import { useUndo } from '@/ui/lib/undo-context'

/**
 * True while a dialog is open.
 *
 * `ignoreInputs` covers text fields, but a dialog's buttons are not input-like and focus
 * is trapped inside it, so without this an undo could rearrange the tree behind a
 * confirmation nobody has answered yet.
 *
 * Keyed on `data-open`, not on the element being present. Base UI leaves a closed dialog
 * in the DOM carrying `data-closed`, so testing for presence alone would block undo for
 * as long as the page lived after the first delete — exactly when you want it most.
 */
function dialogIsOpen(): boolean {
  return (
    document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]') !== null
  )
}

/**
 * Cmd+Z and Cmd+Shift+Z, or Ctrl on Windows and Linux.
 *
 * `ignoreInputs` has to be set, not left to the default. The library's default lets
 * Ctrl/Meta shortcuts through while a text field has focus, which is right for most
 * shortcuts and wrong for this one: inside the rename box or the description, Cmd+Z means
 * undo my typing, and the browser already does that better than we could.
 */
export function useUndoShortcut(): void {
  const { undo, redo } = useUndo()

  useHotkey('Mod+Z', () => !dialogIsOpen() && undo(), {
    ignoreInputs: true,
    meta: { name: 'Undo', description: 'Undo the last change to the tree' },
  })

  useHotkey('Mod+Shift+Z', () => !dialogIsOpen() && redo(), {
    ignoreInputs: true,
    meta: { name: 'Redo', description: 'Redo the change that was just undone' },
  })

  // Windows and Linux users reach for this as often as Ctrl+Shift+Z.
  useHotkey('Control+Y', () => !dialogIsOpen() && redo(), {
    ignoreInputs: true,
    meta: { name: 'Redo', description: 'Redo the change that was just undone' },
  })
}
