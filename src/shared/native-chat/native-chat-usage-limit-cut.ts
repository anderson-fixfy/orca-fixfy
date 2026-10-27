// Derive usage-limit cuts from journal rows on each read for Continue; never store derived state.

import { isRootAgentJournalItem } from '../agent-session-journal-producer'
import { readAgentSessionFailureFact } from '../agent-session-failure'
import type { AgentJournalRenderItem, AgentJournalSubmission } from '../agent-session-journal-types'
import type { AgentSessionUsageLimit } from '../agent-session-usage-limit'
import { findInNativeChatTurn, latestNativeChatTurnSinceRequest } from './native-chat-orca-stop-cut'

/** What the agent is sent when the person continues a turn its usage limit ended. */
export const NATIVE_CHAT_USAGE_LIMIT_CONTINUE_MESSAGE = 'Continue where you left off.'

/** The limit a row reports, when it is a usage-limit row. */
function usageLimitOfRow(item: AgentJournalRenderItem): AgentSessionUsageLimit | null {
  if (!isRootAgentJournalItem(item) || item.body.kind !== 'status') {
    return null
  }
  const fact = readAgentSessionFailureFact(item.body.failure)
  return fact?.kind === 'usageLimitReached' ? (fact.usageLimit ?? {}) : null
}

/** The latest root turn, when a usage limit ended it and nothing was sent since, with the reset
 *  time its row reports. Null otherwise. */
export function latestNativeChatUsageLimitCut(
  items: readonly AgentJournalRenderItem[],
  submissions: readonly Pick<AgentJournalSubmission, 'dispatchState'>[]
): { turnItemId: string; resetsAt?: number } | null {
  const latest = latestNativeChatTurnSinceRequest(items, submissions)
  if (latest?.verdict !== 'failure') {
    return null
  }
  const limit = findInNativeChatTurn(items, latest.turnItem.itemId, usageLimitOfRow)
  return limit === null
    ? null
    : {
        turnItemId: latest.turnItem.itemId,
        ...(limit.resetsAt === undefined ? {} : { resetsAt: limit.resetsAt })
      }
}
