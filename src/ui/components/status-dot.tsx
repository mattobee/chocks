import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_DOT_COLORS, statusOrUnknown, type StatusDefinition } from '@/lib/status'

/**
 * Small coloured dot marking a status, shown in front of the label wherever a status
 * appears. No size class of its own: it takes whatever size the surrounding component
 * already gives an unsized icon, so it reads as one, at whatever scale that context uses
 * (a menu item's icon, an xs button's icon), rather than as a fixed decoration.
 */
export function StatusDot({ statuses, status }: { statuses: StatusDefinition[]; status: string }) {
  const definition = statusOrUnknown(statuses, status)
  return (
    <Circle
      data-icon="inline-start"
      aria-hidden="true"
      // The stroke follows currentColor, which menu hover retints; zero it so the fill is
      // the whole dot, and the fill class is what keeps its colour on hover.
      strokeWidth={0}
      className={cn('shrink-0', STATUS_DOT_COLORS[definition.color])}
    />
  )
}
