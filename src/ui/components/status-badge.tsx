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
    <Badge variant="outline" className="h-5 px-2 text-sm [&>svg]:size-3!">
      <StatusDot statuses={statuses} status={status} />
      {definition.label}
    </Badge>
  )
}
