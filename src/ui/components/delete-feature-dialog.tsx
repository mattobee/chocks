import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog'
import { subtreeIds } from '@/lib/tree'
import type { Feature } from '@/lib/types'

/**
 * Confirms deleting a feature, and says what else goes with it.
 *
 * Deleting a feature removes its whole subtree, which is not obvious from a tree that may
 * be collapsed at the time, so the count is spelled out before anything is written.
 */
export function DeleteFeatureDialog({
  feature,
  features,
  onOpenChange,
  onConfirm,
}: {
  /** Null when nothing is pending deletion — this is what opens the dialog. */
  feature: Feature | null
  /** The whole list, for counting the descendants that go with it. */
  features: Feature[]
  onOpenChange: (open: boolean) => void
  onConfirm: (feature: Feature) => void
}) {
  const descendantCount = feature ? subtreeIds(features, feature.id).length - 1 : 0

  return (
    <AlertDialog open={feature !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive-on-tint dark:bg-destructive/20">
            <Trash2 aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{feature?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {descendantCount > 0
              ? `This deletes the file and ${descendantCount} nested ${descendantCount === 1 ? 'feature' : 'features'}. Recoverable with git if it is committed.`
              : 'This deletes the file. Recoverable with git if it is committed.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!feature) return
              // Base UI's AlertDialogAction does not dismiss the dialog itself.
              onOpenChange(false)
              onConfirm(feature)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
