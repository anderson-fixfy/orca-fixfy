import type { AgentSessionStoreTransactions } from './agent-session-store-transactions'
import {
  commitConversationClearRecord,
  type AgentSessionConversationClear
} from './agent-session-conversation-command-record'
import { settleAgentSessionOperationInto } from './agent-session/ownership/agent-session-operation-admission'
import { commitAgentSessionRewindCompletion } from './agent-session-rewind-completion'
import {
  commitAccountSwitchRecord,
  type AgentSessionAccountSwitch
} from './agent-session-account-switch-record'

export function createAgentSessionConversationReceipts(
  transactions: Pick<AgentSessionStoreTransactions, 'receipt'>
) {
  return {
    clear: (
      clear: () => AgentSessionConversationClear,
      operation: { callerKey: string; operationId: string }
    ) =>
      transactions.receipt((draft) => {
        const completed = clear()
        commitConversationClearRecord(draft, completed)
        settleAgentSessionOperationInto(draft, {
          ...operation,
          outcome: {
            status: 'succeeded',
            sessionId: completed.sessionId,
            conversationCommand: completed.command
          }
        })
      }),
    accountSwitch: (
      change: () => AgentSessionAccountSwitch,
      operation: { callerKey: string; operationId: string }
    ) =>
      transactions.receipt((draft) => {
        const switched = change()
        commitAccountSwitchRecord(draft, switched)
        settleAgentSessionOperationInto(draft, {
          ...operation,
          outcome: {
            status: 'succeeded',
            sessionId: switched.sessionId,
            accountSwitch: {
              accountId: switched.accountSwitch.accountId,
              account: switched.accountSwitch.account
            }
          }
        })
      }),
    rewind: (
      ...args: Parameters<typeof commitAgentSessionRewindCompletion> extends [unknown, ...infer A]
        ? A
        : never
    ) => transactions.receipt((draft) => commitAgentSessionRewindCompletion(draft, ...args))
  }
}
