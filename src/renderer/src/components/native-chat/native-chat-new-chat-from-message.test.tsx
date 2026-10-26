// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { canMirrorLaunchDraftToNativeChat } from '../../../../shared/native-chat-launch-draft-mirrorability'
import { MessageRow } from './NativeChatMessageRow'
import {
  NativeChatNewChatContext,
  openNativeChatNewChatFromMessage
} from './native-chat-new-chat-from-message'

const launchAgentInNewTab = vi.hoisted(() =>
  vi.fn(() => ({ surface: { kind: 'local-chat', tabId: 'chat-2' } }))
)
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab }))
vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

afterEach(() => {
  cleanup()
  launchAgentInNewTab.mockClear()
})

const SOURCE = {
  agent: 'claude',
  worktreeId: 'wt-1',
  groupId: 'group-1',
  executionHostId: 'local'
} as const
const newChatFromSource = (draft: string): void => openNativeChatNewChatFromMessage(SOURCE, draft)

function renderAgentMessage(text: string, withNewChat = true) {
  const message: NativeChatMessage = {
    id: 'assistant-1',
    role: 'assistant',
    timestamp: 0,
    source: 'transcript',
    blocks: [{ type: 'text', text }]
  }
  const row = <MessageRow message={message} expandSignal={false} onScrollMessageToTop={vi.fn()} />
  render(
    withNewChat ? (
      <NativeChatNewChatContext.Provider value={newChatFromSource}>
        {row}
      </NativeChatNewChatContext.Provider>
    ) : (
      row
    )
  )
}

function newChatButton(): HTMLElement {
  return screen.getByRole('button', { name: 'New chat from this message' })
}

describe('New chat from an agent message', () => {
  it('opens a chat tab in the same workspace with the message as an unsent draft', () => {
    renderAgentMessage('Ship the fix behind a flag.')
    fireEvent.click(newChatButton())
    expect(launchAgentInNewTab).toHaveBeenCalledTimes(1)
    expect(launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSurface: 'chat',
        selectedExecutionHostId: 'local',
        agent: 'claude',
        worktreeId: 'wt-1',
        groupId: 'group-1',
        prompt: 'Ship the fix behind a flag.',
        promptDelivery: 'draft'
      })
    )
  })

  it('carries a message too long for a terminal mirror whole into the chat draft', () => {
    const longMessage = Array.from({ length: 60 }, (_, line) => `Line ${line + 1}`).join('\n')
    // The terminal mirror caps drafts; the chat route has no TUI copy to clear, so it must not.
    expect(canMirrorLaunchDraftToNativeChat(longMessage)).toBe(false)
    renderAgentMessage(longMessage)
    fireEvent.click(newChatButton())
    expect(launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedSurface: 'chat',
        prompt: longMessage,
        promptDelivery: 'draft'
      })
    )
  })

  it('is not offered where the pane cannot open a chat', () => {
    renderAgentMessage('Ship the fix behind a flag.', false)
    expect(screen.queryByRole('button', { name: 'New chat from this message' })).toBeNull()
  })
})
