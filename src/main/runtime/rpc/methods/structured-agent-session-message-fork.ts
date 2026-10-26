// `agentSession.forkThroughMessage` — copies a chat's conversation through one agent message into
// a new provider session, which the client then opens as a new chat. The source chat does not change.

import { defineMethod } from '../core'
import { forkStructuredAgentSessionThroughMessage } from '../../../native-chat/agent-session-wire/structured-agent-session-message-fork'
import { requireInstalledStructuredHost } from './structured-agent-session-gate'
import { ItemParams } from '../../../../shared/rpc-contract/structured-agent-session-params'

export const STRUCTURED_AGENT_SESSION_MESSAGE_FORK_METHODS = [
  defineMethod({
    name: 'agentSession.forkThroughMessage',
    permission: 'workspace',
    params: ItemParams,
    handler: async (params, ctx) =>
      forkStructuredAgentSessionThroughMessage(
        await requireInstalledStructuredHost(ctx, params.sessionId),
        params
      )
  })
]
