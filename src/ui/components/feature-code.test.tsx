import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeatureCode } from './feature-code'

describe('FeatureCode', () => {
  it('renders nothing when there is no code', () => {
    const { container } = render(<FeatureCode code={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps author order and renders each path as plain text, not a link', () => {
    render(
      <FeatureCode
        code={[
          { path: 'src/store/format.ts' },
          { path: 'src/store/*.test.ts', kind: 'test' },
          { path: 'new-onboarding', kind: 'flag' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Code' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('src/store/format.ts')).toBeInTheDocument()
    expect(screen.getByText('src/store/*.test.ts')).toBeInTheDocument()
    expect(screen.getByText('new-onboarding')).toBeInTheDocument()
  })

  it('uses distinct icons for test and flag kinds, and a default for code', () => {
    const { container } = render(
      <FeatureCode
        code={[
          { path: 'src/store/format.ts' },
          { path: 'src/store/format.test.ts', kind: 'test' },
          { path: 'new-onboarding', kind: 'flag' },
        ]}
      />,
    )
    expect(container.querySelector('.lucide-code')).toBeInTheDocument()
    expect(container.querySelector('.lucide-flask-conical')).toBeInTheDocument()
    expect(container.querySelector('.lucide-flag')).toBeInTheDocument()
  })
})
