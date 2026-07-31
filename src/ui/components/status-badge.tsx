import { Badge } from '@/ui/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_COLORS, statusOrUnknown, type StatusDefinition } from '@/lib/status'

export function StatusBadge({
  statuses,
  status,
  className,
}: {
  statuses: StatusDefinition[]
  status: string
  className?: string
}) {
  // A status the config does not define still renders, in a neutral dashed style, rather
  // than being hidden or silently corrected.
  const definition = statusOrUnknown(statuses, status)

  return (
    <Badge
      variant="secondary"
      className={cn('border-0', STATUS_COLORS[definition.color], className)}
      title={
        definition.color === 'unknown'
          ? `"${status}" is not defined in this project's config`
          : undefined
      }
    >
      {definition.label}
    </Badge>
  )
}
