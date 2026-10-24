// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FixfyExpandLayer } from './FixfyExpandLayer'

function setSize(element: Element, scroll: number, client: number): void {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: scroll },
    clientHeight: { configurable: true, value: client },
    scrollWidth: { configurable: true, value: 100 },
    clientWidth: { configurable: true, value: 100 }
  })
}

function renderChat(): { tall: HTMLElement; short: HTMLElement } {
  render(
    <div data-native-chat-root="true">
      <div data-native-chat-code-block="">
        <pre data-native-chat-code-content="" data-testid="tall">
          {'one\ntwo\nthree'}
        </pre>
      </div>
      <pre data-native-chat-code-content="" data-testid="short">
        short
      </pre>
      <FixfyExpandLayer />
    </div>
  )
  const tall = screen.getByTestId('tall')
  const short = screen.getByTestId('short')
  setSize(tall, 400, 200)
  setSize(short, 20, 20)
  return { tall, short }
}

describe('FixfyExpandLayer', () => {
  afterEach(cleanup)

  it('offers ⤢ only over a block that scrolls', () => {
    const { tall, short } = renderChat()
    fireEvent.mouseOver(short)
    expect(screen.queryByRole('button', { name: 'Expandir bloco' })).toBeNull()
    fireEvent.mouseOver(tall)
    expect(screen.getByRole('button', { name: 'Expandir bloco' })).toBeInTheDocument()
  })

  it('opens a copy of the block over the chat, and Esc closes it', () => {
    const { tall } = renderChat()
    fireEvent.mouseOver(tall)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir bloco' }))
    const overlay = screen.getByRole('dialog', { name: 'Bloco expandido' })
    expect(overlay).toHaveTextContent('one two three'.replaceAll(' ', '\n'), {
      normalizeWhitespace: false
    })
    expect(overlay.querySelector('[data-native-chat-code-content]')).toBeNull()
    expect(tall).toHaveAttribute('data-native-chat-code-content')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
