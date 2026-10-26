import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session-account-home'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import { pendingAgentSessionRewindFork } from '../../shared/agent-session-rewind'
import { getClaudeProfileRouter } from '../claude-accounts/claude-profile-installed-router'
import {
  claudeLaunchAccountId,
  claudeSavedHostAccount
} from '../claude-accounts/claude-account-launch'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { copyClaudeTranscriptsToAccount } from './claude-account-switch-transcript'
import { CLAUDE_STRUCTURED_AGENT } from './claude-structured-agent-definition'

/** Ready the account's folder and carry the chat's transcripts into it; the record changes after. */
export const claudePrepareAccountSwitch: NonNullable<
  StructuredAgentSessionAdapter['prepareAccountSwitch']
> = async ({ record, accountId }) => {
  const router = getClaudeProfileRouter()
  const saved = accountId === null || !router ? null : claudeSavedHostAccount(router, accountId)
  if (!router || saved === undefined) {
    return { ok: false, reason: 'unknown-account' }
  }
  const managedId = claudeLaunchAccountId(router, accountId)
  const targetHome =
    managedId === null
      ? router.systemDefaultHome()
      : await router.prepareAccount(managedId).catch(() => null)
  if (targetHome === null) {
    return { ok: false, reason: 'setup-failed' }
  }
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle
  const fork = pendingAgentSessionRewindFork(record.rewind, head?.nativeId)
  await copyClaudeTranscriptsToAccount({
    providerSessionIds: [
      ...(head ? [head.nativeId] : []),
      ...(fork ? [fork.sessionId, fork.sourceSessionId] : [])
    ],
    sourceHomes: [
      requireLegacyAgentSessionAccountHome(record.accountHome).path,
      ...router.accountHomes(),
      router.systemDefaultHome()
    ],
    targetHome
  })
  const login = managedId === null ? router.systemDefaultLogin() : router.accountLogin(managedId)
  return {
    ok: true,
    accountHome: { variable: CLAUDE_STRUCTURED_AGENT.accountHomeVariable, path: targetHome },
    account: login?.email ?? saved?.email ?? 'System default'
  }
}
