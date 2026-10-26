// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatMessageRail } from './NativeChatMessageRail'
import { useNativeChatMessageRail } from './use-native-chat-message-rail'
import {
  NativeChatPinnedChaptersContext,
  useNativeChatPinnedChapters
} from './native-chat-pinned-chapters'

vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

afterEach(cleanup)

const NO_SLOTS: never[] = []
const NO_ROWS = { messages: [], turnKeys: [] }

/** One session's chat: the agent's answer to prompt-1, and the rail over three chapters. */
function Chat({ sessionKey }: { sessionKey: string }): React.JSX.Element {
  const pins = useNativeChatPinnedChapters(sessionKey)
  const [scrollRef] = useState(() => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'clientWidth', { value: 800 })
    return { current: element }
  })
  const [outline] = useState(() =>
    Array.from({ length: 3 }, (_, index) => ({
      id: `prompt-${index}`,
      text: `Prompt ${index}`,
      hasImages: false,
      reply: `Reply ${index}`
    }))
  )
  const rail = useNativeChatMessageRail({
    scrollRef,
    slots: NO_SLOTS,
    turnRows: NO_ROWS,
    virtualItems: NO_SLOTS,
    outline
  })
  const answer: NativeChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    timestamp: 0,
    source: 'transcript',
    blocks: [{ type: 'text', text: 'Reply 1' }]
  }
  return (
    <NativeChatPinnedChaptersContext.Provider value={pins}>
      <MessageRow
        message={answer}
        chapterKey="prompt-1"
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
      />
      <NativeChatMessageRail rail={rail} scrollRef={scrollRef} onSelect={vi.fn()} />
    </NativeChatPinnedChaptersContext.Provider>
  )
}

const pinButton = (): HTMLElement => screen.getByRole('button', { name: 'Pin chapter' })
const tick = (name: string): HTMLElement => screen.getByRole('button', { name })
const preview = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-slot="hover-card-content"]')

async function previewOf(name: string): Promise<string | null | undefined> {
  fireEvent.pointerEnter(tick(name), { pointerType: 'mouse' })
  await waitFor(() => expect(preview()).not.toBeNull())
  return preview()?.textContent
}

describe('Pin chapter', () => {
  it('starts pinned, and the agent bar unpins and pins its chapter', () => {
    render(<Chat sessionKey="claude:pin-toggle" />)
    expect(pinButton()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pinButton())
    expect(pinButton()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pinButton())
    expect(pinButton()).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks pinned chapters on the rail, whose preview shows the chapter', async () => {
    render(<Chat sessionKey="claude:pin-rail" />)
    expect(tick('Prompt 1')).toHaveAttribute('data-chapter-pinned', 'true')
    expect(await previewOf('Prompt 1')).toBe('Pinned chapterPrompt 1Reply 1')

    fireEvent.click(pinButton())
    expect(tick('Prompt 1')).toHaveAttribute('data-chapter-pinned', 'false')
    expect(tick('Prompt 0')).toHaveAttribute('data-chapter-pinned', 'true')
    await waitFor(() => expect(preview()?.textContent).toBe('Prompt 1Reply 1'))
  })

  it('keeps each session its own pins', () => {
    const { unmount } = render(<Chat sessionKey="claude:pin-a" />)
    fireEvent.click(pinButton())
    unmount()
    render(<Chat sessionKey="claude:pin-b" />)
    expect(pinButton()).toHaveAttribute('aria-pressed', 'true')
    cleanup()
    render(<Chat sessionKey="claude:pin-a" />)
    expect(pinButton()).toHaveAttribute('aria-pressed', 'false')
  })
})
