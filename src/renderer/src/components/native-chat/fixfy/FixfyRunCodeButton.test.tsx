// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatCodeBlock } from '../NativeChatCodeBlock'
import { NativeChatMarkdownImageOwnerContext } from '../native-chat-markdown-image-owner'

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(() => ({ id: 'tab-run' })),
  setActiveTabType: vi.fn(),
  persistAgentLaunchTabOrder: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      createTab: mocks.createTab,
      setActiveTabType: mocks.setActiveTabType,
      unifiedTabsByWorktree: {
        'wt-1': [{ id: 'unified-chat', entityId: 'chat-tab', groupId: 'group-chat' }]
      }
    })
  }
}))

vi.mock('@/lib/launch-agent-tab-order', () => ({
  persistAgentLaunchTabOrder: mocks.persistAgentLaunchTabOrder
}))

vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))

type Owner = NonNullable<
  ComponentProps<typeof NativeChatMarkdownImageOwnerContext.Provider>['value']
>

const owner: Owner = {
  fileLinkContext: {
    worktreeId: 'wt-1',
    worktreePath: '/repo/wt-1',
    runtimeEnvironmentId: null,
    sourceTabId: 'chat-tab'
  },
  runtimeContext: null,
  isVisible: true
}

function renderBlock(language: string, code: string, value: Owner = owner): void {
  render(
    <NativeChatMarkdownImageOwnerContext.Provider value={value}>
      <NativeChatCodeBlock language={language}>
        <code>{code}</code>
      </NativeChatCodeBlock>
    </NativeChatMarkdownImageOwnerContext.Provider>
  )
}

beforeEach(() => {
  mocks.createTab.mockClear()
  mocks.setActiveTabType.mockClear()
  mocks.persistAgentLaunchTabOrder.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('FixfyRunCodeButton', () => {
  it('runs a multiline shell block unflattened in a terminal beside the chat', () => {
    const code = '# build first\npnpm build && \\\n  pnpm test\n'
    renderBlock('bash', code)

    fireEvent.click(screen.getByRole('button', { name: 'Run in terminal' }))

    expect(mocks.createTab).toHaveBeenCalledWith('wt-1', 'group-chat', undefined, {
      pendingStartup: { command: '# build first\npnpm build && \\\n  pnpm test' },
      startupCwd: '/repo/wt-1'
    })
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal', 'wt-1')
    expect(mocks.persistAgentLaunchTabOrder).toHaveBeenCalledWith('wt-1', 'tab-run')
  })

  it('runs only the prompted lines of a console block', () => {
    renderBlock('console', '$ git status\nOn branch master\n$ git log -1\n')

    fireEvent.click(screen.getByRole('button', { name: 'Run in terminal' }))

    expect(mocks.createTab).toHaveBeenCalledWith(
      'wt-1',
      'group-chat',
      undefined,
      expect.objectContaining({ pendingStartup: { command: 'git status\ngit log -1' } })
    )
  })

  it('stays off non-shell blocks and chats without a worktree', () => {
    renderBlock('typescript', 'const a = 1\n')
    renderBlock('sh', 'ls\n', { ...owner, fileLinkContext: null })

    expect(screen.queryByRole('button', { name: 'Run in terminal' })).toBeNull()
  })
})
