import { parseAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'
import type { AgentSessionMessageForkResult } from '../../../shared/agent-session-message-fork'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'

/** Fork the chat's conversation through one agent message into a new provider session, for a new
 *  chat to resume; the chat and its conversation do not change. */
export async function forkStructuredAgentSessionThroughMessage(
  host: Pick<StructuredAgentSessionHost, 'deps' | 'journalSnapshot'>,
  input: { sessionId: string; itemId: string }
): Promise<AgentSessionMessageForkResult> {
  const record = host.deps.store.getRecord(input.sessionId)
  if (!record || !host.deps.adapter.forkThroughMessage) {
    return { ok: false, reason: 'unsupported' }
  }
  const snapshot = await host.journalSnapshot(input.sessionId)
  const body = snapshot.items.find((item) => item.itemId === input.itemId)?.body
  const message =
    body?.kind === 'message' && body.role === 'assistant'
      ? parseAgentJournalItemKey(input.itemId)
      : null
  if (message?.provider !== 'claude') {
    return { ok: false, reason: 'invalid-target' }
  }
  return host.deps.adapter.forkThroughMessage({
    record,
    message: { sessionId: message.sessionId, uuid: message.uuid }
  })
}
