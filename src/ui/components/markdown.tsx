import { Markdown as TanstackMarkdown } from '@tanstack/markdown/react'

const headingClass = 'mt-5 mb-2 font-semibold first:mt-0'
// Only the top level gets a size of its own. Below that, weight and the space above are
// enough to separate a heading from the prose without the steps getting silly.
const topHeadingClass = `${headingClass} text-lg`

/**
 * Headings in a description start at h2.
 *
 * The title is the only heading the file itself sets, and that is the page's h1. Everything
 * below is a section of the feature, so `# Overview` in a description becomes an h2 sitting
 * alongside Sub-features and History rather than a second page title. Shifting by one and
 * no more leaves the whole of h2 to h6 usable. Anything deeper flattens to h6, which is as
 * far as HTML goes.
 */
const headings = {
  h1: (props: React.ComponentProps<'h2'>) => <h2 className={topHeadingClass} {...props} />,
  h2: (props: React.ComponentProps<'h3'>) => <h3 className={headingClass} {...props} />,
  h3: (props: React.ComponentProps<'h4'>) => <h4 className={headingClass} {...props} />,
  h4: (props: React.ComponentProps<'h5'>) => <h5 className={headingClass} {...props} />,
  h5: (props: React.ComponentProps<'h6'>) => <h6 className={headingClass} {...props} />,
  h6: (props: React.ComponentProps<'h6'>) => <h6 className={headingClass} {...props} />,
}

// The project has no typography plugin, so the elements are styled here. Kept to the ones a
// feature description actually uses.
const components = {
  ...headings,
  p: (props: React.ComponentProps<'p'>) => <p className="mb-3 last:mb-0" {...props} />,
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul className="mb-3 ml-5 list-disc last:mb-0" {...props} />
  ),
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol className="mb-3 ml-5 list-decimal last:mb-0" {...props} />
  ),
  li: (props: React.ComponentProps<'li'>) => <li className="mb-1" {...props} />,
  // A task list renders `- [x]` as a disabled checkbox, and the item's text sits beside it
  // as a sibling rather than a label, so on its own it is a control announced with no name.
  // The state is the whole point of writing the list, so name it rather than hide it.
  input: ({ checked, ...props }: React.ComponentProps<'input'>) => (
    <input
      className="mr-1 align-middle"
      checked={checked}
      aria-label={checked ? 'Done' : 'Not done'}
      {...props}
    />
  ),
  code: (props: React.ComponentProps<'code'>) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  pre: (props: React.ComponentProps<'pre'>) => (
    <pre className="bg-muted mb-3 overflow-x-auto rounded-lg p-3 last:mb-0" {...props} />
  ),
  blockquote: (props: React.ComponentProps<'blockquote'>) => (
    <blockquote className="text-muted-foreground mb-3 border-l-2 pl-3 last:mb-0" {...props} />
  ),
  a: (props: React.ComponentProps<'a'>) => (
    // Descriptions come from files in the repo, which are not always files you wrote.
    // noreferrer keeps this page's url out of whatever the link points at.
    <a className="underline underline-offset-2" rel="noreferrer" {...props} />
  ),
  hr: (props: React.ComponentProps<'hr'>) => <hr className="my-4" {...props} />,
  table: (props: React.ComponentProps<'table'>) => (
    <table className="mb-3 w-full text-left last:mb-0" {...props} />
  ),
  th: (props: React.ComponentProps<'th'>) => (
    <th className="border-b px-2 py-1 font-medium" {...props} />
  ),
  td: (props: React.ComponentProps<'td'>) => <td className="border-b px-2 py-1" {...props} />,
}

/** Renders a feature description. Raw HTML and executable urls are dropped by the parser. */
export function Markdown({ children }: { children: string }) {
  return (
    // Base size, not the small the rest of the page uses. Everything else here is chrome
    // around the description; the description is what you came to read.
    <div className="text-base">
      <TanstackMarkdown components={components}>{children}</TanstackMarkdown>
    </div>
  )
}
