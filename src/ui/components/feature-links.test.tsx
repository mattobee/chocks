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
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Specification',
      'User docs',
      'Proposal',
      'Issue',
    ])
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

  it('links a repo-relative path without a target', () => {
    render(<FeatureLinks links={[{ label: 'Spec', url: 'docs/x-spec.md' }]} />)
    const link = screen.getByRole('link', { name: 'Spec' })
    expect(link).toHaveAttribute('href', 'docs/x-spec.md')
    expect(link).not.toHaveAttribute('target')
  })

  it('leaves a value with an odd scheme as text rather than a link', () => {
    render(<FeatureLinks links={[{ label: 'Docs', url: 'javascript:alert(1)' }]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
  })
})
