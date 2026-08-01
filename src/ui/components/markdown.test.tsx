import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

describe('rendering a description', () => {
  it('renders the usual marks', () => {
    render(<Markdown>{'Ships **soon**, with `chocks status`.'}</Markdown>)

    expect(screen.getByText('soon').tagName).toBe('STRONG')
    expect(screen.getByText('chocks status').tagName).toBe('CODE')
  })

  it('renders lists', () => {
    render(<Markdown>{'- One\n- Two\n'}</Markdown>)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders links', () => {
    render(<Markdown>{'See [the issue](https://example.com/1).'}</Markdown>)

    expect(screen.getByRole('link', { name: 'the issue' })).toHaveAttribute(
      'href',
      'https://example.com/1',
    )
  })

  it('starts headings at h2, a sibling of the page sections', () => {
    // The title is the only heading the file sets, and that is the h1. A description
    // writing `# Overview` means a section of the feature, not a second page title.
    render(<Markdown>{'# Overview\n\n## Detail\n'}</Markdown>)

    expect(screen.getByRole('heading', { name: 'Overview' }).tagName).toBe('H2')
    expect(screen.getByRole('heading', { name: 'Detail' }).tagName).toBe('H3')
  })

  it('flattens deep headings to h6 rather than inventing an h7', () => {
    render(<Markdown>{'##### Five\n\n###### Six\n'}</Markdown>)

    expect(screen.getByRole('heading', { name: 'Five' }).tagName).toBe('H6')
    expect(screen.getByRole('heading', { name: 'Six' }).tagName).toBe('H6')
  })

  it('does not run raw html in a description', () => {
    // Descriptions are files in the repo, and a repo you cloned is not one you wrote.
    const { container } = render(
      <Markdown>{'<img src=x onerror="alert(1)"> and <b>bold</b>'}</Markdown>,
    )

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('drops a javascript: url, link and all', () => {
    render(<Markdown>{'[click](javascript:alert(1))'}</Markdown>)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('click')).toBeInTheDocument()
  })

  it('names the checkboxes in a task list', () => {
    // They are the state of the list, and a disabled checkbox with the item text beside it
    // rather than labelling it is a control announced with no name at all.
    render(<Markdown>{'- [ ] todo\n- [x] done\n'}</Markdown>)

    expect(screen.getByRole('checkbox', { name: 'Not done' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeChecked()
  })

  it('renders a table with header cells', () => {
    render(<Markdown>{'| a | b |\n| --- | --- |\n| 1 | 2 |\n'}</Markdown>)

    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })

  it('renders nothing surprising for empty text', () => {
    const { container } = render(<Markdown>{''}</Markdown>)

    expect(container.textContent).toBe('')
  })
})
