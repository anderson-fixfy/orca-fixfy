// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { AgentSessionMessageForkResult } from '../../../../shared/agent-session-message-fork'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatForkContext, forkNativeChatFromMessage } from './native-chat-fork-from-message'

const forkThroughMessage = vi.hoisted(() =>
  vi.fn<() => Promise<AgentSessionMessageForkResult>>(async () => ({
    ok: true,
    providerSessionId: 'forked-session'
  }))
)
const beginLaunch = vi.hoisted(() =>
  vi.fn(() => ({ settlement: Promise.resolve({ kind: 'structured' }) }))
)
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/structured-agent-session-client', () => ({
  forkStructuredAgentSessionThroughMessage: forkThroughMessage
}))
vi.mock('@/lib/agent-session/structured-agent-session-provisional-tab', () => ({
  beginStructuredAgentSessionProvisionalLaunch: beginLaunch
}))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const TARGET = { kind: 'local' } as const
const SOURCE = {
  sessionId: 'chat-1',
  target: TARGET,
  tabId: 'tab-1',
  worktreeId: 'wt-1',
  executionHostId: 'local'
} as const
const MESSAGE_ID = 'claude:source-session:block%3Amsg_1%3A1'
const forkFromSource = (id: string): Promise<void> => forkNativeChatFromMessage(SOURCE, id)

function renderAgentMessage(working = false) {
  const message: NativeChatMessage = {
    id: MESSAGE_ID,
    role: 'assistant',
    timestamp: 0,
    source: 'transcript',
    blocks: [{ type: 'text', text: 'Ship the fix behind a flag.' }]
  }
  render(
    <NativeChatForkContext.Provider value={forkFromSource}>
      <MessageRow
        message={message}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
        activeTurnIsWorking={working}
        trailingRun={working}
      />
    </NativeChatForkContext.Provider>
  )
}

function forkButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Fork from this message' })
}

describe('Fork from an agent message', () => {
  it('forks the conversation through that message and resumes the fork in a tab beside the chat', async () => {
    renderAgentMessage()
    fireEvent.click(forkButton()!)
    await waitFor(() => expect(beginLaunch).toHaveBeenCalledTimes(1))
    expect(forkThroughMessage).toHaveBeenCalledWith(TARGET, 'chat-1', MESSAGE_ID)
    expect(beginLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        afterTabId: 'tab-1',
        plan: expect.objectContaining({
          route: 'structured-native-chat',
          agent: 'claude',
          worktreeId: 'wt-1',
          executionHostId: 'local',
          resumeFrom: { providerSessionId: 'forked-session' }
        })
      })
    )
    expect(toastError).not.toHaveBeenCalled()
  })

  it('opens nothing and says so when Claude has not saved the message yet', async () => {
    forkThroughMessage.mockResolvedValueOnce({ ok: false, reason: 'not-saved' })
    renderAgentMessage()
    fireEvent.click(forkButton()!)
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Claude hasn't saved this message yet. Try again in a moment."
      )
    )
    expect(beginLaunch).not.toHaveBeenCalled()
  })

  it('is not offered on a message the agent is still writing', () => {
    renderAgentMessage(true)
    expect(forkButton()).toBeNull()
  })
})
