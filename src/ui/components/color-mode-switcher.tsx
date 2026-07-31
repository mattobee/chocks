import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const

/**
 * Three-way colour mode control: follow the system, or force light or dark.
 *
 * Built on Base UI's radio group rather than its toggle group. Toggle group renders
 * role="group" with aria-pressed buttons, which describes three independent toggles and
 * says nothing about choosing one deselecting the others. This is one-of-three, so it
 * wants radio semantics even though a segmented control is what it looks like.
 */
export function ColorModeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The stored preference is not known until the client has read it, so the control is
  // inert until then rather than briefly claiming the wrong mode is selected.
  useEffect(() => setMounted(true), [])

  return (
    <RadioGroup
      aria-label="Colour mode"
      aria-busy={!mounted}
      value={mounted ? (theme ?? 'system') : null}
      onValueChange={(value) => setTheme(String(value))}
      disabled={!mounted}
      className="flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {MODES.map(({ value, label, Icon }) => (
        <Radio.Root
          key={value}
          value={value}
          className={cn(
            'text-muted-foreground flex size-7 items-center justify-center rounded-md outline-none transition-colors',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
            'data-checked:bg-muted data-checked:text-foreground',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
