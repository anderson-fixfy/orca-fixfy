import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import type { AgentSessionStatusSummary } from '../../shared/agent-session-wire'
import {
  type AgentSessionUserNameWrite,
  compareAndSetAgentSessionRecordName,
  setAgentSessionRecordConversationName,
  setAgentSessionRecordUserNameThrough
} from '../runtime/agent-session-record-conversation-name'
import {
  createStructuredChatNamingHandler,
  type StructuredChatNameGeneration
} from '../native-chat/structured-chat-naming'
import { createFixfyChatRename, fixfyRenamePromptName } from './fixfy-chat-rename'

async function settle() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve()
  }
}

function rig(firstPrompt: string) {
  let record: AgentSessionRecord = agentSessionRecordFixture()
  const mutate = async (apply: (current: AgentSessionRecord) => AgentSessionRecord) => {
    record = apply(record)
    return record
  }
  const store = {
    getRecord: () => record,
    setConversationName: (_id: string, name: string | null) =>
      mutate((current) => setAgentSessionRecordConversationName(current, name, Date.now())),
    compareAndSetConversationName: (_id: string, name: string | null, expected: string | null) =>
      compareAndSetAgentSessionRecordName(mutate, name, expected),
    setUserConversationName: (_id: string, name: string, write: AgentSessionUserNameWrite) =>
      setAgentSessionRecordUserNameThrough(mutate, name, write)
  }
  let finishGeneration: (result: StructuredChatNameGeneration) => void = () => {}
  const generate = vi.fn(
    () =>
      new Promise<StructuredChatNameGeneration>((resolve) => {
        finishGeneration = resolve
      })
  )
  const nameChat = createStructuredChatNamingHandler({
    getStore: () => store,
    getSettings: () => ({}),
    now: () => 100,
    workerTaskTitle: () => null,
    readFirstPrompt: async () => firstPrompt,
    readJournalFirstPrompt: async () => firstPrompt,
    generate,
    onNamed: vi.fn(),
    logger: { warn: vi.fn(), error: vi.fn() },
    wait: async () => {}
  })
  const publish = vi.fn()
  const retitle = vi.fn()
  const rename = createFixfyChatRename({ getStore: () => store, publish, warn: vi.fn() })
  const summary = (latestPrompt: string): AgentSessionStatusSummary => ({
    sessionId: record.sessionId,
    workspaceId: record.location.workspaceId,
    agent: 'claude',
    status: 'working',
    latestPrompt,
    updatedAt: 100
  })
  return {
    nameChat,
    generate,
    finishGeneration: (result: StructuredChatNameGeneration) => finishGeneration(result),
    rename: (prompt: string, options = { replay: false }) =>
      rename(summary(prompt), options, retitle),
    summary,
    publish,
    retitle,
    name: () => record.conversationName
  }
}

describe('fixfyRenamePromptName', () => {
  it('takes the name after /rename and ignores everything else', () => {
    expect(fixfyRenamePromptName('/rename fixfy-workspace')).toBe('fixfy-workspace')
    expect(fixfyRenamePromptName('  /rename   orca fixfy  ')).toBe('orca fixfy')
    expect(fixfyRenamePromptName('/rename')).toBeNull()
    expect(fixfyRenamePromptName('/renamed foo')).toBeNull()
    expect(fixfyRenamePromptName('please /rename foo')).toBeNull()
  })
})

describe('createFixfyChatRename', () => {
  it('names the launch chat before the automatic seed, which then neither seeds nor generates', async () => {
    const state = rig('/rename fixfy-f0')
    const summary = state.summary('/rename fixfy-f0')
    await state.rename('/rename fixfy-f0')
    state.nameChat(summary, { replay: false })
    await settle()
    expect(state.name()).toBe('fixfy-f0')
    expect(state.generate).not.toHaveBeenCalled()
    expect(state.publish).toHaveBeenCalledTimes(1)
    expect(state.retitle).toHaveBeenCalledWith(summary.workspaceId, summary.sessionId)
  })

  it('keeps the /rename name when it lands after the seed and before the generated name', async () => {
    const state = rig('/rename fixfy-f0')
    state.nameChat(state.summary('/rename fixfy-f0'), { replay: false })
    await settle()
    expect(state.name()).toBe('/rename fixfy-f0')
    await state.rename('/rename fixfy-f0')
    state.finishGeneration({ name: 'Rename session' })
    await settle()
    expect(state.name()).toBe('fixfy-f0')
  })

  it('renames a named chat on a later /rename typed by hand', async () => {
    const state = rig('fix the login flow')
    state.nameChat(state.summary('fix the login flow'), { replay: false })
    await settle()
    state.finishGeneration({ name: 'auth/login' })
    await settle()
    expect(state.name()).toBe('auth/login')
    await state.rename('/rename login-bug')
    expect(state.name()).toBe('login-bug')
  })

  it('renames once per prompt, and not on replay or for other prompts', async () => {
    const state = rig('')
    await state.rename('/rename kept', { replay: true })
    expect(state.name()).toBeUndefined()
    await state.rename('/rename kept')
    expect(state.name()).toBeUndefined()
    await state.rename('/rename first')
    expect(state.name()).toBe('first')
    await state.rename('/rename first')
    await state.rename('ship it')
    await state.rename('/rename')
    expect(state.name()).toBe('first')
    expect(state.publish).toHaveBeenCalledTimes(1)
  })
})
