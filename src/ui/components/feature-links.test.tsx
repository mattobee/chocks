import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeatureLinks } from './feature-links'

describe('FeatureLinks', () => {
  it('renders nothing when there are no links', () => {
    const { container } = render(<FeatureLinks links={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the five known keys in fixed order with unknowns after', () => {
    render(
      <FeatureLinks
        links={{
          docs: 'https://docs.example.com/x',
          issue: 'https://github.com/mattobee/chocks/issues/48',
          design: 'https://www.figma.com/file/x',
          'docs-internal': 'docs/x.md',
          pr: 'https://github.com/mattobee/chocks/pull/51',
          spec: 'docs/x-spec.md',
        }}
      />,
    )
    const links = screen.getAllByRole('link')
    // Known keys are pinned to a fixed order; the unknown one follows them as-is.
    expect(links.map((link) => link.textContent)).toEqual([
      'Docs',
      'Issue',
      'Pull request',
      'Design',
      'Spec',
      'Docs internal',
    ])
  })

  it('opens a URL in a new tab', () => {
    render(<FeatureLinks links={{ docs: 'https://docs.example.com/x' }} />)
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('href', 'https://docs.example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('links a repo-relative path without a target', () => {
    render(<FeatureLinks links={{ spec: 'docs/x-spec.md' }} />)
    const link = screen.getByRole('link', { name: 'Spec' })
    expect(link).toHaveAttribute('href', 'docs/x-spec.md')
    expect(link).not.toHaveAttribute('target')
  })

  it('leaves a value with an odd scheme as text rather than a link', () => {
    render(<FeatureLinks links={{ docs: 'javascript:alert(1)' }} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
  })
})
