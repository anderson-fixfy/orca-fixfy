import { createClaudeStructuredLaunchResolver } from '../runtime/structured-agent-launch-composition.test-support'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentSessionOwnerProbe } from '../../shared/agent-session-lease-adjudication'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import {
  ClaudeProfileRouter,
  type ClaudeProfileRouterSettings
} from '../claude-accounts/claude-profile-router'
import { installClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'
import { createClaudeProfileReport } from '../claude-accounts/claude-profile-report'
import { AgentSessionJournal } from '../native-chat/agent-session-journal/journal-store'
import { openTestJournalHostDatabase } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import { openTestAgentSessionRecordStore } from '../runtime/agent-session-record-store-test-harness'
import { claudePrepareAccountSwitch } from './claude-account-switch'

const NOW = 1_800_000_000_000
const SESSION = 'session-alpha'
const PROVIDER_SESSION = 'ran-under-a'
const PROJECT = '-repos-workspace-1'
const INDETERMINATE: AgentSessionOwnerProbe = { outcome: 'indeterminate', reason: 'no answer' }
const roots: string[] = []

afterEach(() => {
  installClaudeProfileRouter(undefined)
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function savedAccount(id: string): ClaudeManagedAccount {
  return {
    id,
    email: `${id}@example.com`,
    managedAuthPath: `/managed/${id}`,
    authMethod: 'subscription-oauth',
    createdAt: NOW,
    updatedAt: NOW,
    lastAuthenticatedAt: NOW
  }
}

/** Two signed-in, set-up accounts whose homes keep their own `projects/`; `a` is selected. */
function twoAccounts() {
  const root = mkdtempSync(join(tmpdir(), 'claude-account-switch-'))
  roots.push(root)
  const home = (id: string) => join(root, 'claude-profiles', id, 'home')
  for (const id of ['a', 'b']) {
    mkdirSync(home(id), { recursive: true })
    writeFileSync(join(root, 'claude-profiles', id, 'profile.json'), '{}')
    writeFileSync(
      join(home(id), '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: `${id}@example.com` } })
    )
  }
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [savedAccount('a'), savedAccount('b')],
    activeClaudeManagedAccountId: 'a',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  installClaudeProfileRouter(
    new ClaudeProfileRouter({
      getSettings: () => settings,
      dataRoot: root,
      userHome: join(root, 'personal'),
      env: {},
      runSetup: async () => ({ ...createClaudeProfileReport(), outcome: 'prepared' })
    })
  )
  return { root, home }
}

/** A released chat on account `a` that has run one conversation there. */
async function chatOnAccountA(root: string, homeA: string) {
  const store = await openTestAgentSessionRecordStore(root)
  await store.reserveOwner({
    sessionId: SESSION,
    location: {
      executionHostId: 'local',
      wslDistro: null,
      workspaceId: 'workspace-1',
      workspaceKind: 'folder'
    },
    provider: 'claude',
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: homeA },
    expectedFence: null,
    spawnToken: 'spawn-a',
    claimKeyId: 'key-1',
    handoffOperationId: null,
    probe: INDETERMINATE,
    operation: {
      callerKey: 'client-1',
      operationId: `${NOW}-${'1'.repeat(32)}`,
      fingerprint: 'fp'
    },
    now: NOW
  })
  const fence = store.getRecord(SESSION)!.lease.runtimeFence
  await store.commitProcessIdentity({
    sessionId: SESSION,
    fence,
    process: { hostId: 'local', pid: 4242, processStartTimeMs: NOW, spawnToken: 'spawn-a' },
    now: NOW
  })
  await store.proveOwner({
    sessionId: SESSION,
    fence,
    link: {
      linkId: 'link-1',
      origin: 'created',
      mintedAtFence: fence,
      observedAt: NOW,
      handle: claudeProviderHandle(PROVIDER_SESSION, 'leaf-1')
    },
    now: NOW
  })
  await store.evictProvenDeadOwner({
    sessionId: SESSION,
    expectedFence: fence,
    probe: { outcome: 'exit-observed' },
    now: NOW + 1
  })
  const transcript = join(homeA, 'projects', PROJECT, `${PROVIDER_SESSION}.jsonl`)
  mkdirSync(join(homeA, 'projects', PROJECT, PROVIDER_SESSION, 'subagents'), { recursive: true })
  writeFileSync(transcript, '{"type":"user","uuid":"leaf-1"}\n')
  writeFileSync(
    join(homeA, 'projects', PROJECT, PROVIDER_SESSION, 'subagents', 'agent-1.jsonl'),
    '{"type":"user"}\n'
  )
  return { store, transcript }
}

it('switches a chat to another account by copying its transcript there and resuming it there', async () => {
  const { root, home } = twoAccounts()
  const { store, transcript } = await chatOnAccountA(root, home('a'))
  const before = store.getRecord(SESSION)!

  const prepared = await claudePrepareAccountSwitch({ record: before, accountId: 'b' })
  expect(prepared).toEqual({
    ok: true,
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: home('b') },
    account: 'b@example.com'
  })
  const copied = join(home('b'), 'projects', PROJECT, `${PROVIDER_SESSION}.jsonl`)
  expect(readFileSync(copied, 'utf8')).toBe(readFileSync(transcript, 'utf8'))
  expect(
    existsSync(join(home('b'), 'projects', PROJECT, PROVIDER_SESSION, 'subagents', 'agent-1.jsonl'))
  ).toBe(true)
  if (!prepared.ok) {
    return
  }

  const journal = new AgentSessionJournal({
    database: openTestJournalHostDatabase(root),
    identity: {
      sessionId: SESSION,
      workspaceId: 'workspace-1',
      hostId: 'local',
      agent: 'claude',
      providerHandle: null
    },
    now: () => NOW + 5
  })
  await journal.open()
  const operation = { callerKey: 'client-1', operationId: `${NOW}-${'2'.repeat(32)}` }
  await store.admitOperation({ ...operation, fingerprint: 'switch', now: NOW })
  const fence = before.lease.runtimeFence
  const accountSwitch = {
    accountId: 'b',
    account: prepared.account,
    ...operation,
    switchedAt: NOW + 5
  }
  await journal.context.switchAccount(
    { accountId: 'b', account: prepared.account },
    { operationId: operation.operationId, fence },
    store.conversationReceipts.accountSwitch(
      () => ({ sessionId: SESSION, fence, accountHome: prepared.accountHome, accountSwitch }),
      operation
    )
  )
  const switched = store.getRecord(SESSION)!
  expect(switched).toMatchObject({
    accountHome: prepared.accountHome,
    accountSwitch,
    providerHandleChain: before.providerHandleChain
  })
  expect(journal.snapshot().items.find((item) => item.body.kind === 'status')?.body).toMatchObject({
    text: 'Account switched - b@example.com',
    presentation: 'account-switched',
    accountSwitch: { accountId: 'b', account: 'b@example.com' }
  })

  // The next owner reserves under the record's own account: no identity conflict.
  await expect(
    store.reserveOwner({
      sessionId: SESSION,
      location: switched.location,
      provider: 'claude',
      accountHome: switched.accountHome,
      expectedFence: switched.lease.runtimeFence,
      spawnToken: 'spawn-b',
      claimKeyId: 'key-1',
      handoffOperationId: null,
      probe: INDETERMINATE,
      operation: {
        callerKey: 'client-1',
        operationId: `${NOW}-${'3'.repeat(32)}`,
        fingerprint: 'fp-3'
      },
      now: NOW + 6
    })
  ).resolves.toMatchObject({ disposition: 'reserved' })

  // `a` stays selected; the chat resumes on `b`, where its transcript now is.
  const resolve = createClaudeStructuredLaunchResolver({
    store: { getRecord: () => store.getRecord(SESSION)!, pinLaunchDirectory: vi.fn() },
    resolveLaunchArgs: () => [],
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => '/usr/local/bin/claude',
    resolveInheritedEnv: async () => ({ PATH: '/usr/bin' }),
    resolveAuthPolicy: () => ({ account: 'managed' })
  })
  const launch = await resolve({
    identity: {
      sessionId: SESSION,
      workspaceId: 'workspace-1',
      hostId: 'local',
      agent: 'claude',
      providerHandle: claudeProviderHandle(PROVIDER_SESSION, 'leaf-1')
    }
  })
  expect(launch.claudeConfigDir).toBe(home('b'))
  expect(launch.env).toMatchObject({ CLAUDE_CONFIG_DIR: home('b') })
  expect(launch.options).toMatchObject({ resume: PROVIDER_SESSION })
  expect(launch.resumeLeafUuid).toBe('leaf-1')
})

it('resumes a chat switched to System default there, and refuses one whose account was removed', async () => {
  const { root } = twoAccounts()
  const systemHome = join(root, 'personal', '.claude')
  mkdirSync(join(systemHome, 'projects', PROJECT), { recursive: true })
  writeFileSync(join(systemHome, 'projects', PROJECT, `${PROVIDER_SESSION}.jsonl`), '{}\n')
  const handle = claudeProviderHandle(PROVIDER_SESSION, 'leaf-1')
  let accountId: string | null = null
  const resolve = createClaudeStructuredLaunchResolver({
    store: {
      getRecord: () => ({
        ...agentSessionRecordFixture(),
        providerHandleChain: [
          { linkId: 'link-1', origin: 'created', mintedAtFence: 1, observedAt: NOW, handle }
        ],
        accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: systemHome },
        accountSwitch: {
          accountId,
          account: 'me@example.com',
          operationId: 'switch-1',
          callerKey: 'client-1',
          switchedAt: NOW
        }
      }),
      pinLaunchDirectory: vi.fn()
    },
    resolveLaunchArgs: () => [],
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => '/usr/local/bin/claude',
    resolveInheritedEnv: async () => ({ PATH: '/usr/bin' }),
    resolveAuthPolicy: () => ({ account: 'managed' })
  })
  const identity = {
    sessionId: agentSessionRecordFixture().sessionId,
    workspaceId: 'workspace-1',
    hostId: 'local',
    agent: 'claude' as const,
    providerHandle: handle
  }

  const launch = await resolve({ identity })
  expect(launch.claudeConfigDir).toBe(systemHome)
  expect(launch.env?.CLAUDE_CONFIG_DIR).toBeUndefined()
  expect(launch.account).toBe('system')
  expect(launch.options).toMatchObject({ resume: PROVIDER_SESSION })

  accountId = 'removed'
  await expect(resolve({ identity })).rejects.toMatchObject({
    reason: 'claudeAccountFolderMissing'
  })
})
