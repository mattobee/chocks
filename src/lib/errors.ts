/**
 * The most useful single line about a thrown value, whatever it turned out to be.
 *
 * `catch` gives you `unknown`, and the two things that reach a user — an API response and
 * a line in the terminal — both want one sentence rather than a guess at the shape.
 */
export function describeError(error: unknown): string {
  // An Error with no message stringifies to "Error", which is no more use than saying
  // nothing, so it gets the same fallback as a thrown object.
  if (error instanceof Error) return error.message === '' ? 'Unknown error' : error.message
  const described = String(error)
  return described === '' || described === '[object Object]' ? 'Unknown error' : described
}
