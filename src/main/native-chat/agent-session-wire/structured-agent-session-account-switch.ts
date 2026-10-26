import type {
  AgentSessionAccountSwitchParams,
  AgentSessionAccountSwitchResult
} from '../../../shared/agent-session-account-switch'
import {
  CLAUDE_PROFILE_MISSING_MESSAGE,
  CLAUDE_PROFILE_SETUP_FAILED_MESSAGE
} from '../../../shared/claude-profile-routing'
import type { AgentSessionMutationResult } from '../../../shared/agent-session-wire'
import { refuse } from '../../../shared/agent-session-wire-refusals'
import type { AgentSessionAccountSwitch } from '../../runtime/agent-session-account-switch-record'
import { admitAndRunAgentSessionMutation } from './structured-agent-session-mutation-admission'
import type { StructuredAgentSessionMutationContext } from './structured-agent-session-host-mutations'
import { sendPreparation } from './structured-agent-session-send-preparation'
import {
  runAfterRewindStart,
  type ReadyOperationSelection
} from './structured-agent-session-ready-operation'
import type { StructuredAgentSessionCaller } from './structured-agent-session-host-types'
import { hostStructuredAgentSessionCurrentWork } from './structured-agent-session-host-current-work'
import { conversationCommandBlocked } from './structured-conversation-command-admission'

const METHOD = 'agentSession.switchAccount'

/** Moves a chat to another account as `/clear` does its context: the same tab and Orca session,
 *  the agent stopped, and a divider; the next start resumes the conversation in that account. */
export function runStructuredAccountSwitch(
  context: StructuredAgentSessionMutationContext,
  caller: StructuredAgentSessionCaller,
  params: AgentSessionAccountSwitchParams
): Promise<AgentSessionMutationResult<AgentSessionAccountSwitchResult>> {
  return runAfterRewindStart(
    context,
    caller.callerKey,
    params.envelope,
    { method: METHOD, fields: { accountId: params.accountId } },
    (selection) => switchUnderSerialize(context, caller, params, selection)
  )
}

async function switchUnderSerialize(
  context: StructuredAgentSessionMutationContext,
  caller: StructuredAgentSessionCaller,
  params: AgentSessionAccountSwitchParams,
  selection: ReadyOperationSelection
): Promise<AgentSessionMutationResult<AgentSessionAccountSwitchResult>> {
  const { envelope, accountId } = params
  const { sessionId, clientOperationId } = envelope
  const store = context.deps.store
  const childWork = () => ({
    views: context.readChildWork(sessionId),
    open: context.childWorkOpen(sessionId)
  })
  let change: AgentSessionAccountSwitch | null = null
  return admitAndRunAgentSessionMutation({
    store,
    adapter: context.deps.adapter,
    agents: context.deps.agents,
    logger: context.deps.logger,
    callerKey: caller.callerKey,
    envelope,
    prepareSession: sendPreparation(context, envelope, { refusesInRun: true }, selection),
    journal: () => context.sessions.get(sessionId)?.journal,
    currentWork: () =>
      hostStructuredAgentSessionCurrentWork({ store, sessions: context.sessions }, sessionId),
    publish: (journal) => context.publish(sessionId, journal),
    now: context.now,
    plan: {
      method: METHOD,
      fields: { accountId },
      conversationWrite: true,
      recoverUnknownFromDurableState: true,
      settlesWithWrite: true,
      successReceipt: () =>
        store.conversationReceipts.accountSwitch(
          () => {
            if (!change) {
              throw new Error('agent_session_account_switch_not_completed')
            }
            return change
          },
          { callerKey: caller.callerKey, operationId: clientOperationId }
        ),
      replay: (_ctx, outcome) => {
        if (outcome.status === 'succeeded' && outcome.accountSwitch) {
          return outcome.accountSwitch
        }
        const recorded = store.getRecord(sessionId)?.accountSwitch
        return recorded?.operationId === clientOperationId &&
          recorded.callerKey === caller.callerKey
          ? { accountId: recorded.accountId, account: recorded.account }
          : null
      },
      // Without a committed record the chat never moved; a copied transcript is safe to copy again.
      rerunWhenReplayMissing: () => true,
      run: async (ctx) => {
        const blocked = conversationCommandBlocked(
          ctx,
          store.getRecord(sessionId)!,
          childWork(),
          context.sessions.get(sessionId)?.child ? undefined : 'at-rest'
        )
        if (blocked) {
          return { ok: false, refusal: blocked }
        }
        // No process may outlive the switch on the account it is leaving.
        await context.stopAgent(sessionId, { cause: 'evict', resting: true })
        const stopped = store.getRecord(sessionId)!
        const fence = stopped.lease.runtimeFence
        const rechecked = conversationCommandBlocked(
          { ...ctx, fence },
          stopped,
          childWork(),
          'at-rest'
        )
        if (rechecked) {
          return { ok: false, refusal: rechecked }
        }
        const prepared = await ctx.adapter.prepareAccountSwitch?.({ record: stopped, accountId })
        if (!prepared?.ok) {
          return {
            ok: false,
            refusal:
              prepared?.reason === 'setup-failed'
                ? refuse(
                    'agent_session_operation_invalid',
                    { reason: 'claudeAccountSetupFailed' },
                    CLAUDE_PROFILE_SETUP_FAILED_MESSAGE
                  )
                : refuse(
                    'agent_session_operation_invalid',
                    { reason: 'claudeAccountFolderMissing' },
                    CLAUDE_PROFILE_MISSING_MESSAGE
                  )
          }
        }
        const value = { accountId, account: prepared.account }
        change = {
          sessionId,
          fence,
          accountHome: prepared.accountHome,
          accountSwitch: {
            ...value,
            operationId: clientOperationId,
            callerKey: caller.callerKey,
            switchedAt: context.now()
          }
        }
        if (!ctx.operationReceipt) {
          throw new Error('agent_session_account_switch_receipt_missing')
        }
        await ctx.journal.context.switchAccount(
          value,
          { operationId: clientOperationId, fence },
          ctx.operationReceipt
        )
        return { ok: true, value }
      }
    }
  })
}
