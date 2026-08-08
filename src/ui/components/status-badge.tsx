import { Badge } from '@/ui/components/ui/badge'
import { statusOrUnknown, type StatusDefinition } from '@/lib/status'
import { StatusDot } from '@/ui/components/status-dot'

export function StatusBadge({
  statuses,
  status,
}: {
  statuses: StatusDefinition[]
  status: string
}) {
  const definition = statusOrUnknown(statuses, status)
  return (
    <Badge variant="outline" size="sm">
      <StatusDot statuses={statuses} status={status} />
      {definition.label}
    </Badge>
  )
}
