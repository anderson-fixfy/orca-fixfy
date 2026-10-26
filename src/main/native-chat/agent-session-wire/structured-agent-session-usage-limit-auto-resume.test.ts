import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatUsageLimitAutoResume } from '../../../shared/native-chat/native-chat-usage-limit-auto-resume'
import { AgentSessionUsageLimitAutoResumeFile } from '../../runtime/agent-session-usage-limit-auto-resume-file'
import {
  createStructuredAgentSessionUsageLimitAutoResume,
  type StructuredAgentSessionUsageLimitAutoResumeDeps
} from './structured-agent-session-usage-limit-auto-resume'

const T0 = Date.UTC(2026, 9, 26, 12, 0, 0)
const RESETS_AT = T0 + 3 * 60 * 60 * 1000
const RESUME_AT = RESETS_AT + 60_000

type Cut = { turnItemId: string; resetsAt?: number } | null

function memoryFile(initial: NativeChatUsageLimitAutoResume[] = []) {
  let entries = initial
  const file: StructuredAgentSessionUsageLimitAutoResumeDeps['file'] = {
    read: async () => [...entries],
    update: async (change) => {
      const changed = change([...entries])
      entries = changed.entries
      return changed.result
    }
  }
  return { file, entries: () => entries }
}

/** One chat that sits on a usage-limit cut until something is sent into it. */
function chat(file: StructuredAgentSessionUsageLimitAutoResumeDeps['file'], cut: Cut) {
  const state: { cut: Cut; sent: string[] } = { cut, sent: [] }
  const autoResume = createStructuredAgentSessionUsageLimitAutoResume({
    file,
    readCut: async () => state.cut,
    sendContinue: async (_sessionId, turnItemId) => {
      state.sent.push(turnItemId)
      state.cut = null
    },
    now: () => Date.now(),
    logger: { warn: vi.fn(), error: vi.fn() }
  })
  return { state, autoResume }
}

describe('usage-limit auto-resume schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the Continue for the reset plus one minute', async () => {
    const memory = memoryFile()
    const { autoResume } = chat(memory.file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })

    await expect(autoResume.schedule('chat-1', 'turn-1')).resolves.toEqual({
      sessionId: 'chat-1',
      turnItemId: 'turn-1',
      resumeAt: RESUME_AT
    })
    expect(memory.entries()).toEqual([
      { sessionId: 'chat-1', turnItemId: 'turn-1', resumeAt: RESUME_AT }
    ])
    autoResume.stop()
  })

  it('schedules nothing when the limit gave no reset time or the chat moved on', async () => {
    const memory = memoryFile()
    const { state, autoResume } = chat(memory.file, { turnItemId: 'turn-1' })

    await expect(autoResume.schedule('chat-1', 'turn-1')).resolves.toBeNull()
    state.cut = { turnItemId: 'turn-2', resetsAt: RESETS_AT }
    await expect(autoResume.schedule('chat-1', 'turn-1')).resolves.toBeNull()
    expect(memory.entries()).toEqual([])
  })

  it('sends Continue once, at that time', async () => {
    const memory = memoryFile()
    const { state, autoResume } = chat(memory.file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await autoResume.schedule('chat-1', 'turn-1')

    await vi.advanceTimersByTimeAsync(RESUME_AT - T0 - 1)
    expect(state.sent).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(state.sent).toEqual(['turn-1'])
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(state.sent).toEqual(['turn-1'])
    expect(memory.entries()).toEqual([])
  })

  it('goes away when a message is sent before the reset', async () => {
    const memory = memoryFile()
    const { state, autoResume } = chat(memory.file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await autoResume.schedule('chat-1', 'turn-1')

    state.cut = null
    await expect(autoResume.list('chat-1')).resolves.toEqual([])
    expect(memory.entries()).toEqual([])
    await vi.advanceTimersByTimeAsync(RESUME_AT - T0)
    expect(state.sent).toEqual([])
  })

  it('does not send a Continue whose chat moved on by the time it is due', async () => {
    const memory = memoryFile()
    const { state, autoResume } = chat(memory.file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await autoResume.schedule('chat-1', 'turn-1')

    state.cut = { turnItemId: 'turn-2', resetsAt: RESETS_AT + 1 }
    await vi.advanceTimersByTimeAsync(RESUME_AT - T0)
    expect(state.sent).toEqual([])
    expect(memory.entries()).toEqual([])
  })

  it('goes away on Cancel', async () => {
    const memory = memoryFile()
    const { state, autoResume } = chat(memory.file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await autoResume.schedule('chat-1', 'turn-1')

    await autoResume.cancel('chat-1')
    expect(memory.entries()).toEqual([])
    await vi.advanceTimersByTimeAsync(RESUME_AT - T0)
    expect(state.sent).toEqual([])
  })
})

describe('usage-limit auto-resume across a restart', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-usage-limit-auto-resume-'))
  })
  afterEach(async () => {
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps the schedule on disk for the next Orca', async () => {
    vi.useFakeTimers({ now: T0, toFake: ['Date'] })
    const cut = { turnItemId: 'turn-1', resetsAt: RESETS_AT }
    const before = chat(new AgentSessionUsageLimitAutoResumeFile(directory), cut)
    await before.autoResume.schedule('chat-1', 'turn-1')
    before.autoResume.stop()

    const after = chat(new AgentSessionUsageLimitAutoResumeFile(directory), cut)
    await after.autoResume.start()
    await expect(after.autoResume.list()).resolves.toEqual([
      { sessionId: 'chat-1', turnItemId: 'turn-1', resumeAt: RESUME_AT }
    ])
    expect(after.state.sent).toEqual([])
    after.autoResume.stop()
  })

  it('sends a Continue that came due while Orca was closed once it opens', async () => {
    vi.useFakeTimers({ now: RESUME_AT + 5 * 60_000, toFake: ['Date'] })
    const file = new AgentSessionUsageLimitAutoResumeFile(directory)
    await file.update(() => ({
      entries: [{ sessionId: 'chat-1', turnItemId: 'turn-1', resumeAt: RESUME_AT }],
      result: undefined
    }))

    const opened = chat(file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await opened.autoResume.start()
    expect(opened.state.sent).toEqual(['turn-1'])
    await expect(file.read()).resolves.toEqual([])
    opened.autoResume.stop()

    const reopened = chat(file, { turnItemId: 'turn-1', resetsAt: RESETS_AT })
    await reopened.autoResume.start()
    expect(reopened.state.sent).toEqual([])
  })

  it('drops a due Continue on open when the chat moved on while Orca was closed', async () => {
    vi.useFakeTimers({ now: RESUME_AT + 5 * 60_000, toFake: ['Date'] })
    const file = new AgentSessionUsageLimitAutoResumeFile(directory)
    await file.update(() => ({
      entries: [{ sessionId: 'chat-1', turnItemId: 'turn-1', resumeAt: RESUME_AT }],
      result: undefined
    }))

    const opened = chat(file, null)
    await opened.autoResume.start()
    expect(opened.state.sent).toEqual([])
    await expect(file.read()).resolves.toEqual([])
    opened.autoResume.stop()
  })
})
