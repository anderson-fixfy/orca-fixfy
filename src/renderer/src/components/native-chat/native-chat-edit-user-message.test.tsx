// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import {
  clearNativeChatComposerDraftsForTests,
  readNativeChatComposerDraft,
  structuredAgentSessionDraftScopeKey
} from './native-chat-composer-draft-store'
import { writeNativeChatDraftCache } from './native-chat-draft-cache'
import {
  NativeChatEditUserMessageContext,
  editNativeChatUserMessage
} from './native-chat-edit-user-message'
import type * as RevealFocusModule from './use-native-chat-composer-reveal-focus'

const requestNativeChatComposerFocus = vi.hoisted(() => vi.fn())
vi.mock('./use-native-chat-composer-reveal-focus', async (importOriginal) => ({
  ...(await importOriginal<typeof RevealFocusModule>()),
  requestNativeChatComposerFocus
}))
vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

afterEach(() => {
  cleanup()
  clearNativeChatComposerDraftsForTests()
  requestNativeChatComposerFocus.mockClear()
})

const CHAT = { sessionId: 'session-1', tabId: 'tab-1' }
const SCOPE = structuredAgentSessionDraftScopeKey(CHAT.sessionId)
const edit = (message: NativeChatMessage): void => editNativeChatUserMessage(CHAT, message)

function renderUserMessage(
  blocks: NativeChatMessage['blocks'],
  options: { withEdit?: boolean; from?: NativeChatMessage['from'] } = {}
) {
  const message: NativeChatMessage = {
    id: 'user-1',
    role: 'user',
    timestamp: 0,
    source: 'transcript',
    blocks,
    ...(options.from ? { from: options.from } : {})
  }
  const row = <MessageRow message={message} expandSignal={false} onScrollMessageToTop={vi.fn()} />
  render(
    options.withEdit === false ? (
      row
    ) : (
      <NativeChatEditUserMessageContext.Provider value={edit}>
        {row}
      </NativeChatEditUserMessageContext.Provider>
    )
  )
}

const editButton = (): HTMLElement => screen.getByRole('button', { name: 'Edit message' })

describe('Edit a sent user message', () => {
  it('puts the message alone in an empty composer and focuses it', () => {
    renderUserMessage([{ type: 'text', text: 'Rename the flag to `enableFoo`.' }])
    fireEvent.click(editButton())
    expect(readNativeChatComposerDraft(SCOPE).text).toBe('Rename the flag to `enableFoo`.')
    expect(requestNativeChatComposerFocus).toHaveBeenCalledWith('tab-1')
  })

  it('adds the message below the draft already typed, keeping it', () => {
    writeNativeChatDraftCache(SCOPE, 'Half-written follow-up')
    renderUserMessage([{ type: 'text', text: 'Rename the flag to `enableFoo`.' }])
    fireEvent.click(editButton())
    expect(readNativeChatComposerDraft(SCOPE).text).toBe(
      'Half-written follow-up\n\nRename the flag to `enableFoo`.'
    )
  })

  it('brings the message images back with their chips', () => {
    renderUserMessage([
      { type: 'text', text: 'What is wrong here? [Image #1]' },
      { type: 'image-ref', path: '/tmp/shot.png' }
    ])
    fireEvent.click(editButton())
    const draft = readNativeChatComposerDraft(SCOPE)
    expect(draft.images).toEqual([{ id: 'edited-user-1-1', path: '/tmp/shot.png' }])
    expect(draft.text).not.toContain('[Image #1]')
  })

  it('is not offered where the pane has no composer, or on another agent message', () => {
    renderUserMessage([{ type: 'text', text: 'Ship it.' }], { withEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull()
    cleanup()
    renderUserMessage([{ type: 'text', text: 'Ship it.' }], {
      from: { kind: 'agent', senders: [], orchestration: null }
    })
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull()
  })
})
