import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_DOT_COLORS, statusOrUnknown, type StatusDefinition } from '@/lib/status'

/** Small coloured dot marking a status, shown in front of the label wherever a status appears. */
export function StatusDot({ statuses, status }: { statuses: StatusDefinition[]; status: string }) {
  const definition = statusOrUnknown(statuses, status)
  return (
    <Circle
      data-icon="inline-start"
      aria-hidden="true"
      // The stroke follows currentColor, which menu hover retints; zero it so the fill is
      // the whole dot, and the fill class is what keeps its colour on hover.
      strokeWidth={0}
      // size-2 is deliberate: a dot reads at a fraction of a normal icon, so this is the
      // one place that overrides the size shadcn's components default an icon to.
      className={cn('size-2 shrink-0', STATUS_DOT_COLORS[definition.color])}
    />
  )
}
