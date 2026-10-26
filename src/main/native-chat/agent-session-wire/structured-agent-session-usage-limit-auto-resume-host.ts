// Binds the usage-limit auto-resume schedule to one host: its journal reads the cut, and its own
// send path sends the Continue the row's button sends, as the person's message.

import { randomUUID } from 'node:crypto'
import { createStructuredAgentSessionOperationId } from '../../../shared/structured-agent-session-mutation'
import {
  structuredAgentSessionMessageSendMutation,
  structuredAgentSessionSendBody
} from '../../../shared/structured-agent-session-send-mutation'
import {
  latestNativeChatUsageLimitCut,
  NATIVE_CHAT_USAGE_LIMIT_CONTINUE_MESSAGE
} from '../../../shared/native-chat/native-chat-usage-limit-cut'
import type { StructuredAgentSessionHost } from './structured-agent-session-host'
import { structuredAgentSessionConversationFence } from './structured-agent-session-provider-child'
import {
  createStructuredAgentSessionUsageLimitAutoResume,
  type StructuredAgentSessionUsageLimitAutoResume,
  type StructuredAgentSessionUsageLimitAutoResumeDeps
} from './structured-agent-session-usage-limit-auto-resume'

export const STRUCTURED_AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_CALLER =
  'trusted-local:usage-limit-auto-resume'

const installed = new WeakMap<object, StructuredAgentSessionUsageLimitAutoResume>()

/** The schedule a host serves; undefined on a host built without one. */
export function structuredAgentSessionUsageLimitAutoResumeOf(
  host: object
): StructuredAgentSessionUsageLimitAutoResume | undefined {
  return installed.get(host)
}

export function installStructuredAgentSessionUsageLimitAutoResume(
  host: Pick<StructuredAgentSessionHost, 'deps' | 'send' | 'journalSnapshot'>,
  file: StructuredAgentSessionUsageLimitAutoResumeDeps['file']
): StructuredAgentSessionUsageLimitAutoResume {
  const autoResume = createStructuredAgentSessionUsageLimitAutoResume({
    file,
    readCut: async (sessionId) => {
      if (!host.deps.store.getRecord(sessionId)) {
        return null
      }
      const snapshot = await host.journalSnapshot(sessionId)
      return latestNativeChatUsageLimitCut(snapshot.items, snapshot.submissions)
    },
    sendContinue: async (sessionId, turnItemId) => {
      const sent = await host.send(
        { callerKey: STRUCTURED_AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_CALLER },
        {
          ...structuredAgentSessionMessageSendMutation({
            sessionId,
            clientOperationId: createStructuredAgentSessionOperationId(randomUUID),
            expectedRuntimeFence: structuredAgentSessionConversationFence(
              host.deps.store,
              sessionId
            ),
            body: structuredAgentSessionSendBody(NATIVE_CHAT_USAGE_LIMIT_CONTINUE_MESSAGE, []),
            // The host re-checks the cut under the send's own serialization.
            usageLimitContinuationOfTurnItemId: turnItemId
          }),
          personsMessage: true
        }
      )
      if (!sent.ok) {
        throw new Error(sent.refusal.code)
      }
    },
    now: () => Date.now(),
    logger: host.deps.logger
  })
  installed.set(host, autoResume)
  return autoResume
}
