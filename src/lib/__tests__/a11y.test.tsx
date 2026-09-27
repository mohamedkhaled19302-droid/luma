// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { announce, keyboardHandler, useReducedMotion, visuallyHidden } from '../a11y'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

function installMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  installMatchMedia(false)
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    cb()
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('visuallyHidden', () => {
  it('keeps content off-screen but in the accessibility tree', () => {
    render(<div className={visuallyHidden}>hidden message</div>)
    const node = screen.getByText('hidden message')
    expect(node.className).toContain('absolute')
    expect(node.className).toContain('clip:rect(0,0,0,0)')
  })
})

describe('useReducedMotion', () => {
  it('defaults to false when the user prefers motion', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('is true when the OS preference is reduce', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })
})

describe('announce', () => {
  it('creates a single persistent role=status live region', () => {
    announce('Plan applied')
    announce('Plan applied')
    const regions = document.body.querySelectorAll('[role="status"]')
    expect(regions).toHaveLength(1)
    expect(regions.item(0).textContent).toBe('Plan applied')
  })
})

describe('keyboardHandler', () => {
  it('exposes button semantics on non-interactive elements', () => {
    const { role, tabIndex } = keyboardHandler(() => undefined)
    expect(role).toBe('button')
    expect(tabIndex).toBe(0)
  })

  it('activates on Enter and Space', () => {
    const onActivate = vi.fn()
    const { onKeyDown } = keyboardHandler(onActivate)
    render(
      <div role="button" tabIndex={0} onKeyDown={onKeyDown}>
        fake button
      </div>,
    )
    const node = screen.getByRole('button')
    fireEvent.keyDown(node, { key: 'Enter', charCode: 13 })
    fireEvent.keyDown(node, { key: ' ', charCode: 32 })
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('ignores unrelated keys', () => {
    const onActivate = vi.fn()
    const { onKeyDown } = keyboardHandler(onActivate)
    render(
      <div role="button" tabIndex={0} onKeyDown={onKeyDown}>
        fake button
      </div>,
    )
    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowDown' })
    expect(onActivate).not.toHaveBeenCalled()
  })
})

describe('UI component semantics', () => {
  it('progress bars expose progressbar role with an accessible name', () => {
    render(<Progress value={50} aria-label="Day balance progress" />)
    expect(screen.getByRole('progressbar', { name: 'Day balance progress' })).toBeInTheDocument()
  })

  it('warning badges use an AA-safe amber shade', () => {
    const { container } = render(<Badge variant="warn">Due today</Badge>)
    expect(screen.getByText('Due today')).toBeInTheDocument()
    expect(container.querySelector('.bg-warning\\/10')).toBeTruthy()
    expect(container.querySelector('.text-amber-800')).toBeTruthy()
    expect(container.querySelector('.dark\\:text-amber-300')).toBeTruthy()
  })

  it('success badges use an AA-safe emerald shade', () => {
    const { container } = render(<Badge variant="success">Completed</Badge>)
    expect(container.querySelector('.text-emerald-800')).toBeTruthy()
    expect(container.querySelector('.dark\\:text-emerald-300')).toBeTruthy()
  })

  it('icon-only buttons expose a name through aria-label', () => {
    render(<Button variant="outline" size="icon" aria-label="Reset timer" />)
    expect(screen.getByRole('button', { name: 'Reset timer' })).toBeInTheDocument()
  })
})