import { Button } from '@/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { statusOrUnknown, type StatusDefinition } from '@/lib/status'
import { StatusDot } from '@/ui/components/status-dot'

/**
 * Inline status picker for the feature page and tree rows. A menu of radio items rather
 * than a Select because picking fires a write immediately; it is an action, not a form
 * value. The dialog keeps Select because there it really is a form field.
 */
export function StatusDropdown({
  statuses,
  status,
  ariaLabel,
  size = 'default',
  className,
  onChange,
}: {
  statuses: StatusDefinition[]
  status: string
  ariaLabel: string
  size?: 'xs' | 'sm' | 'default'
  className?: string
  onChange: (status: string) => void
}) {
  const current = statusOrUnknown(statuses, status)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size={size}
            aria-label={ariaLabel}
            className={cn('rounded-full', className)}
          />
        }
      >
        <StatusDot statuses={statuses} status={status} />
        {current.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={status} onValueChange={(value) => onChange(String(value))}>
          {statuses.map((item) => (
            // closeOnClick defaults to false in Base UI, which would keep the menu open
            // after picking, unlike the Select it replaces.
            <DropdownMenuRadioItem key={item.id} value={item.id} closeOnClick>
              <StatusDot statuses={statuses} status={item.id} />
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
