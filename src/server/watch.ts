import { existsSync, statSync } from 'node:fs'
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
  watcher.on('error', (error) => {
    // Degrade to "no live reload" rather than crashing, but say so. Failing silently means
    // edits just stop appearing, with nothing to connect that to.
    console.warn('chocks: no longer watching for file changes', error)
  })

  return () => {
    if (timer) clearTimeout(timer)
    void watcher.close()
  }
}

/**
 * Watches for git activity — commits, staging, branch switches.
 *
 * Committing a feature does not modify the feature file, so the feature watcher above
 * sees nothing and an "uncommitted changes" indicator would stay stale until a reload.
 * `.git/index` covers staging and commits; `.git/HEAD` covers checkouts and branch
 * switches.
 *
 * Returns a no-op teardown when there is no `.git` directory to watch, which includes
 * running chocks outside a repo and the worktree/submodule case where `.git` is a file.
 */
export function watchGit(repoRoot: string, onChange: () => void): () => void {
  const gitDir = path.join(repoRoot, '.git')
  if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) return () => {}

  // Watch the directory, not the files inside it. git replaces `.git/index` by writing a
  // lock file and renaming it over the top, so the inode a file-level watch is holding
  // vanishes — and on macOS, where fsevents reports directory-level events anyway, such a
  // watch simply stops firing. Watching the directory and filtering by name is reliable.
  const INTERESTING = new Set(['index', 'HEAD', 'ORIG_HEAD', 'MERGE_HEAD'])

  const watcher = chokidar.watch(gitDir, {
    ignoreInitial: true,
    depth: 0,
    // These paths were explicitly requested; the dotfile rule used for feature files would
    // exclude the entire .git directory.
    ignored: () => false,
  })

  let timer: NodeJS.Timeout | undefined
  const schedule = (filePath: string) => {
    if (!INTERESTING.has(path.basename(filePath))) return
    if (timer) clearTimeout(timer)
    // git rewrites the index more than once during a single commit, and even a plain
    // `git status` can refresh it, so coalesce generously.
    timer = setTimeout(onChange, 150)
  }

  watcher.on('add', schedule)
  watcher.on('change', schedule)
  watcher.on('unlink', schedule)
  watcher.on('error', (error) => {
    // Losing git notifications should degrade to a stale badge, not crash the server.
    console.warn('chocks: no longer watching git', error)
  })

  return () => {
    if (timer) clearTimeout(timer)
    void watcher.close()
  }
}
