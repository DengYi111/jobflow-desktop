// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Navigation } from '../../src/renderer/app/Navigation'

afterEach(cleanup)

describe('Chinese navigation labels', () => {
  it('names the interview and personal materials sections clearly', () => {
    render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>,
    )
    expect(screen.getByText('面试与题库')).toBeTruthy()
    expect(screen.getByText('个人信息与简历')).toBeTruthy()
    expect(screen.queryByText('面试')).toBeNull()
    expect(screen.queryByText('资料库')).toBeNull()
  })
})
