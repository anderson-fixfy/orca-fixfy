import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session-mutation-envelope'
import { codexProviderHandle } from '../../../shared/agent-session-provider-handle-encoding'
import type { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import { openTestAgentSessionRecordStore } from '../../runtime/agent-session-record-store-test-harness'
import { openTestJournalHostDatabase } from '../agent-session-journal/journal-host-database-test-support'
import type {
  AgentSessionDispatchOutcome,
  StructuredAgentSessionAdapter
} from './structured-agent-session-adapter'
import { claudeAndCodexDeclared } from './structured-agent-session-adapter-router-test-support'
import { StructuredAgentSessionHost } from './structured-agent-session-host'
import {
  HOST_TEST_NOW,
  HOST_TEST_SESSION as SESSION,
  HOST_TEST_THREAD as THREAD,
  hostTestAttachParams,
  hostTestMessage,
  hostTestOperationId,
  resetHostTestOperationIds
} from './structured-agent-session-host-test-data'
import { startsWhenPublished } from './structured-agent-session-instant-start.test-support'
import { createStructuredAgentSessionLogger } from './structured-agent-session-logger'

const caller = { callerKey: 'desktop' }
const OTHER_HOME = { variable: 'CODEX_HOME', path: '/home/dev/.codex-adm' }

let directory: string
let store: AgentSessionRecordStore
let host: StructuredAgentSessionHost
let acquires = 0
const prepareAccountSwitch =
  vi.fn<NonNullable<StructuredAgentSessionAdapter['prepareAccountSwitch']>>()
const dispatch = vi.fn<StructuredAgentSessionAdapter['dispatch']>()

function openHost(): StructuredAgentSessionHost {
  return new StructuredAgentSessionHost({
    agents: claudeAndCodexDeclared(),
    logger: createStructuredAgentSessionLogger(),
    store,
    adapter: startsWhenPublished(
      {
        supportsCreate: (_location, agent) => agent === 'codex',
        supportsLocation: () => true,
        acquire: async (input) => {
          acquires += 1
          return {
            process: {
              hostId: 'local',
              pid: 4000 + acquires,
              processStartTimeMs: HOST_TEST_NOW,
              spawnToken: input.spawnToken
            },
            acquisitionGeneration: `generation-${acquires}`,
            link: {
              linkId: `link-${acquires}`,
              mintedAtFence: input.fence,
              observedAt: HOST_TEST_NOW,
              origin: acquires === 1 ? 'created' : 'resumed',
              handle: codexProviderHandle(THREAD)
            }
          }
        },
        dispatch,
        cancelTurn: async () => ({ cancelled: false }),
        answerPrompt: async () => {},
        setOption: async () => {},
        prepareAccountSwitch,
        releaseAcquisition: async () => true,
        closeSession: async () => true
      },
      () => host
    ),
    journalDatabase: openTestJournalHostDatabase(directory),
    claimKeyId: 'key',
    now: () => HOST_TEST_NOW,
    probeOwner: async () => ({ outcome: 'exit-observed' }),
    idleSweep: { intervalMs: 3_600_000 }
  })
}

beforeEach(async () => {
  resetHostTestOperationIds()
  acquires = 0
  prepareAccountSwitch.mockReset().mockResolvedValue({
    ok: true,
    accountHome: OTHER_HOME,
    account: 'adm@example.com'
  })
  dispatch.mockReset().mockImplementation(async (input): Promise<AgentSessionDispatchOutcome> => ({
    state: 'accepted',
    providerIdentity: {
      provider: 'codex',
      threadId: THREAD,
      turnId: input.clientMessageId,
      ordinal: 1
    }
  }))
  directory = await mkdtemp(join(tmpdir(), 'orca-account-switch-'))
  store = await openTestAgentSessionRecordStore(directory)
  host = openHost()
})

afterEach(async () => {
  await host.flushAllStreamedEvents()
  await rm(directory, { recursive: true, force: true })
})

function envelope(method: string, fields: Record<string, unknown>) {
  return {
    sessionId: SESSION,
    clientOperationId: hostTestOperationId(),
    expectedRuntimeFence: store.getRecord(SESSION)!.lease.runtimeFence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method,
      sessionId: SESSION,
      fields
    })
  }
}

function switchParams(accountId: string | null) {
  return { accountId, envelope: envelope('agentSession.switchAccount', { accountId }) }
}

function send(text: string) {
  const body = hostTestMessage(text)
  return host.send(caller, { body, envelope: envelope('agentSession.send', { body }) })
}

async function dividers() {
  return (await host.journalSnapshot(SESSION)).items.flatMap((item) =>
    item.body.kind === 'status' && item.body.presentation === 'account-switched'
      ? [item.body.text]
      : []
  )
}

describe('switching a chat to another account', () => {
  it('stops the agent, moves the record with a divider, and the next send starts it there', async () => {
    expect(await host.attach(caller, hostTestAttachParams(null))).toMatchObject({ ok: true })
    const chain = store.getRecord(SESSION)!.providerHandleChain
    const params = switchParams('adm')

    const switched = await host.conversationCommands.switchAccount(caller, params)
    expect(switched).toMatchObject({
      ok: true,
      value: { accountId: 'adm', account: 'adm@example.com' }
    })
    expect(store.getRecord(SESSION)).toMatchObject({
      accountHome: OTHER_HOME,
      accountSwitch: { accountId: 'adm', account: 'adm@example.com' },
      providerHandleChain: chain,
      lease: { ownerProcess: null, claimStatus: 'released' }
    })
    expect(await dividers()).toEqual(['Account switched - adm@example.com'])

    // A replay answers with what landed, without carrying anything again.
    expect(await host.conversationCommands.switchAccount(caller, params)).toMatchObject({
      ok: true,
      replayed: true,
      value: { accountId: 'adm', account: 'adm@example.com' }
    })
    expect(prepareAccountSwitch).toHaveBeenCalledOnce()

    const before = acquires
    expect(await send('after the switch')).toMatchObject({ ok: true })
    await vi.waitFor(() => expect(acquires - before).toBe(1))
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
  })

  it('leaves the chat where it was when the account cannot take it', async () => {
    expect(await host.attach(caller, hostTestAttachParams(null))).toMatchObject({ ok: true })
    prepareAccountSwitch.mockResolvedValue({ ok: false, reason: 'unknown-account' })
    const record = store.getRecord(SESSION)!

    expect(
      await host.conversationCommands.switchAccount(caller, switchParams('gone'))
    ).toMatchObject({
      ok: false,
      refusal: { details: { reason: 'claudeAccountFolderMissing' } }
    })
    expect(store.getRecord(SESSION)).toMatchObject({ accountHome: record.accountHome })
    expect(store.getRecord(SESSION)?.accountSwitch).toBeUndefined()
    expect(await dividers()).toEqual([])
  })

  it('waits for the message in flight instead of stopping the agent', async () => {
    expect(await host.attach(caller, hostTestAttachParams(null))).toMatchObject({ ok: true })
    expect(await send('still working')).toMatchObject({ ok: true })
    const running = store.getRecord(SESSION)!.lease.ownerProcess

    expect(
      await host.conversationCommands.switchAccount(caller, switchParams('adm'))
    ).toMatchObject({
      ok: false,
      refusal: { details: { reason: 'messagesUnsettled' } }
    })
    expect(prepareAccountSwitch).not.toHaveBeenCalled()
    expect(store.getRecord(SESSION)?.lease.ownerProcess).toEqual(running)
  })
})
