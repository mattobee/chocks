import * as React from 'react'
import { cn } from '@/lib/utils'

function Timeline({ className, ...props }: React.ComponentProps<'ol'>) {
  return <ol data-slot="timeline" className={cn('flex flex-col', className)} {...props} />
}

function TimelineItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="timeline-item"
      className={cn('group/timeline-item relative grid grid-cols-[1.5rem_1fr] gap-x-3', className)}
      {...props}
    />
  )
}

function TimelineIndicator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-indicator"
      className={cn(
        'bg-background text-muted-foreground z-10 col-start-1 row-start-1 flex size-6 items-center justify-center rounded-full border',
        className,
      )}
      {...props}
    />
  )
}

function TimelineSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-separator"
      aria-hidden="true"
      className={cn(
        'bg-border col-start-1 row-start-1 row-span-2 mx-auto mt-6 h-[calc(100%-1.5rem)] w-px group-last/timeline-item:hidden',
        className,
      )}
      {...props}
    />
  )
}

function TimelineHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-header"
      className={cn('col-start-2 row-start-1 min-w-0', className)}
      {...props}
    />
  )
}

function TimelineTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-title"
      className={cn('text-sm leading-6 font-medium', className)}
      {...props}
    />
  )
}

function TimelineContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="timeline-content"
      className={cn('text-muted-foreground col-start-2 row-start-2 min-w-0 pb-5 text-xs', className)}
      {...props}
    />
  )
}

function TimelineDate({ className, ...props }: React.ComponentProps<'time'>) {
  return <time data-slot="timeline-date" className={cn('tabular-nums', className)} {...props} />
}

export {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
}
