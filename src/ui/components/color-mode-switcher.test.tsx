import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ColorModeSwitcher } from './color-mode-switcher'

const setTheme = vi.fn()
let theme: string | undefined = 'system'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme, setTheme }),
}))

beforeEach(() => {
  setTheme.mockClear()
  theme = 'system'
})

describe('semantics', () => {
  // Base UI's ToggleGroup renders role="group" with aria-pressed buttons, which describes
  // three independent toggles. This is one-of-three, so it has to be a radio group.
  it('is a named radio group, not a set of toggles', async () => {
    render(<ColorModeSwitcher />)
    const group = await screen.findByRole('radiogroup', { name: 'Colour mode' })
    expect(group).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('offers all three modes by name', async () => {
    render(<ColorModeSwitcher />)
    for (const name of ['System', 'Light', 'Dark']) {
      expect(await screen.findByRole('radio', { name })).toBeInTheDocument()
    }
  })

  it('marks the current mode as checked', async () => {
    theme = 'dark'
    render(<ColorModeSwitcher />)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked())
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
  })
})

describe('choosing a mode', () => {
  it('sets the theme', async () => {
    const user = userEvent.setup()
    render(<ColorModeSwitcher />)
    await user.click(await screen.findByRole('radio', { name: 'Dark' }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('can go back to following the system', async () => {
    theme = 'light'
    const user = userEvent.setup()
    render(<ColorModeSwitcher />)
    await user.click(await screen.findByRole('radio', { name: 'System' }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })
})
