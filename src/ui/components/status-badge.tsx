import { Badge } from '@/ui/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_LABELS, type FeatureStatus } from '@/lib/types'

/**
 * Status colours are hardcoded rather than themed: there are exactly four, they are
 * semantic, and they must stay legible against both the light and dark surfaces.
 */
const STATUS_CLASSES: Record<FeatureStatus, string> = {
  planned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'in-progress': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  dropped: 'bg-transparent text-muted-foreground line-through',
}

export function StatusBadge({ status, className }: { status: FeatureStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('border-0', STATUS_CLASSES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
