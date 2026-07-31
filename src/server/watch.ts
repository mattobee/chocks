import path from 'node:path'
import chokidar from 'chokidar'

/**
 * Watches the chocks directory and calls `onChange` when feature files change.
 *
 * Events are coalesced: a `git checkout` or a branch switch rewrites many files at once,
 * and the client only needs telling to refetch once. Returns a stop function.
 */
export function watchFeatures(root: string, onChange: () => void): () => void {
  const resolvedRoot = path.resolve(root)

  const watcher = chokidar.watch(resolvedRoot, {
    ignoreInitial: true,
    ignored: (filePath: string) => {
      // Our own atomic writes land as `.tmp` before being renamed into place.
      if (filePath.endsWith('.tmp')) return true
      // Ignore dotfiles by their own name only. Testing the full path would match the
      // root itself, which is normally `.chocks` — that silently ignored everything.
      const resolved = path.resolve(filePath)
      if (resolved === resolvedRoot) return false
      const relative = path.relative(resolvedRoot, resolved)
      return relative.split(path.sep).some((segment) => segment.startsWith('.'))
    },
  })

  let timer: NodeJS.Timeout | undefined
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 50)
  }

  watcher.on('add', schedule)
  watcher.on('change', schedule)
  watcher.on('unlink', schedule)
  watcher.on('addDir', schedule)
  watcher.on('unlinkDir', schedule)
  watcher.on('error', () => {
    // A watch failure should degrade to "no live reload", not crash the server.
  })

  return () => {
    if (timer) clearTimeout(timer)
    void watcher.close()
  }
}
