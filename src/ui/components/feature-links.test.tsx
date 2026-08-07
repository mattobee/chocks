import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeatureLinks } from './feature-links'

describe('FeatureLinks', () => {
  it('renders nothing when there are no links', () => {
    const { container } = render(<FeatureLinks links={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps author order rather than grouping by type', () => {
    render(
      <FeatureLinks
        links={[
          { label: 'Specification', url: 'docs/x-spec.md', type: 'spec' },
          { label: 'User docs', url: 'https://docs.example.com/x', type: 'docs' },
          { label: 'Proposal', url: 'docs/proposal.md', type: 'unknown' },
          { label: 'Issue', url: 'https://github.com/mattobee/chocks/issues/48', type: 'issue' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Links' })).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'User docs',
      'Issue',
    ])
    expect(screen.getByText('Specification')).not.toHaveClass('text-primary', 'hover:underline')
    expect(screen.getByText('Proposal')).not.toHaveClass('text-primary', 'hover:underline')
  })

  it('uses the URL as text when the label is missing', () => {
    render(<FeatureLinks links={[{ url: 'https://docs.example.com/x' }]} />)
    expect(screen.getByRole('link', { name: 'https://docs.example.com/x' })).toBeInTheDocument()
  })

  it('uses known type icons and a generic icon otherwise', () => {
    const { container } = render(
      <FeatureLinks
        links={[
          { label: 'Docs', url: 'https://docs.example.com/x', type: 'docs' },
          { label: 'PR', url: 'https://example.com/pr', type: 'pr' },
          { label: 'Untyped', url: 'https://example.com/untyped' },
          { label: 'Unknown', url: 'https://example.com/unknown', type: 'custom' },
        ]}
      />,
    )
    expect(container.querySelector('.lucide-book-open')).toBeInTheDocument()
    expect(container.querySelector('.lucide-git-pull-request')).toBeInTheDocument()
    expect(container.querySelectorAll('.lucide-link')).toHaveLength(2)
  })

  it('opens a URL in a new tab', () => {
    render(<FeatureLinks links={[{ label: 'Docs', url: 'https://docs.example.com/x' }]} />)
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('href', 'https://docs.example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('treats a protocol-relative URL as external', () => {
    render(<FeatureLinks links={[{ label: 'Docs', url: '//docs.example.com/x' }]} />)
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('href', '//docs.example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('leaves a repo-relative path as plain text', () => {
    render(<FeatureLinks links={[{ label: 'Spec', url: 'docs/x-spec.md' }]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Spec')).not.toHaveClass('text-primary', 'hover:underline')
  })

  it.each(['javascript:alert(1)', 'mailto:docs@example.com', 'vscode://file/repo/docs.md'])(
    'leaves %s as plain text rather than a link',
    (url) => {
      render(<FeatureLinks links={[{ label: 'Docs', url }]} />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText('Docs')).not.toHaveClass('text-primary', 'hover:underline')
    },
  )
})
