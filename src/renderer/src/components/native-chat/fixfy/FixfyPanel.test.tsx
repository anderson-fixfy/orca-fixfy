// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat-types'
import type { FixfyPanelResult } from '../../../../../shared/fixfy-panel-types'
import { FixfyPanel } from './FixfyPanel'

const NOW = Date.parse('2026-10-24T12:00:00Z')

function message(id: string, blocks: NativeChatMessage['blocks']): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks,
    timestamp: null,
    source: 'transcript'
  }
}

const messages = [
  message('m1', [
    { type: 'tool-call', name: 'Skill', input: { skill: 'fixfy:plan-runner' }, callId: 'c1' },
    { type: 'tool-call', name: 'Edit', input: { file_path: '/ws/a.ts' }, callId: 'c2' },
    { type: 'tool-call', name: 'Edit', input: { file_path: '/ws/a.ts' }, callId: 'c3' },
    {
      type: 'tool-call',
      name: 'Bash',
      input: { command: 'git commit -m x && git push' },
      callId: 'c4'
    },
    { type: 'tool-call', name: 'mcp__atlassian__getJiraIssue', input: {}, callId: 'c5' },
    { type: 'tool-call', name: 'Write', input: { file_path: '/ws/failed.ts' }, callId: 'c6' }
  ]),
  message('m2', [{ type: 'tool-result', output: 'denied', isError: true, callId: 'c6' }])
]

const data: FixfyPanelResult = {
  ids: ['claude-a'],
  launchDirectory: '/ws',
  ttlMin: 60,
  cost: 1.234,
  turnCost: 1.234,
  subagentCost: 0,
  turns: 3,
  subagents: 0,
  lastTurnAt: NOW - 20 * 60_000,
  lastContext: 150_000
}

async function renderPanel(): Promise<void> {
  render(<FixfyPanel sessionId="s1" messages={messages} isWorking={false} isVisible />)
  await act(async () => {})
}

describe('FixfyPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    localStorage.clear()
    Object.assign(window, { api: { fixfyPanel: { get: vi.fn(async () => data) } } })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('opens collapsed with the measured cost, the chat activity and the cache deadline', async () => {
    await renderPanel()
    const header = screen.getByRole('button', { name: /^Painel da Fixfy/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(header).toHaveAccessibleName(
      'Painel da Fixfy: US$ 1,23, 150 mil de contexto, 1 skill, 1 arquivo, 1 commit, 1 push, 1 chamada MCP, cache vence em 40 min'
    )
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('expands into groups that each collapse, and keeps the choice for the next chat', async () => {
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Painel da Fixfy/ }))
    expect(screen.getByRole('list', { name: 'Arquivos' })).toHaveTextContent('a.ts×2')
    expect(screen.getByRole('list', { name: 'MCP' })).toHaveTextContent('Jira1')

    fireEvent.click(screen.getByRole('button', { name: 'Arquivos · 1' }))
    expect(screen.queryByRole('list', { name: 'Arquivos' })).toBeNull()

    cleanup()
    await renderPanel()
    expect(screen.getByRole('button', { name: /^Painel da Fixfy/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.queryByRole('list', { name: 'Arquivos' })).toBeNull()
    expect(screen.getByRole('list', { name: 'Skills' })).toBeInTheDocument()
  })

  it('says why the measurement is missing instead of hiding the panel', async () => {
    Object.assign(window, {
      api: { fixfyPanel: { get: vi.fn(async () => ({ error: 'sessão remota' })) } }
    })
    render(<FixfyPanel sessionId="s1" messages={[]} isWorking={false} isVisible />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: /^Painel da Fixfy/ })).toHaveAccessibleName(
      'Painel da Fixfy: medição indisponível: sessão remota'
    )
  })
})
