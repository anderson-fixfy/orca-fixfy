// `agentSession.switchAccount` — the user moves a chat to another of its agent's accounts, in the
// same tab and Orca session; the host answers once the record and its divider land.

import { defineMethod } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredCapability,
  requireStructuredSessionHost,
  structuredCallerFor
} from './structured-agent-session-gate'
import { SwitchAccountParams } from './structured-agent-session-schemas'

export const STRUCTURED_AGENT_SESSION_SWITCH_ACCOUNT_METHODS = [
  defineMethod({
    name: 'agentSession.switchAccount',
    permission: 'workspace',
    params: SwitchAccountParams,
    handler: async (params, ctx) => {
      requireStructuredCapability(ctx)
      await ensureStructuredHostInstalled(ctx)
      const host = requireStructuredSessionHost(ctx, params.envelope.sessionId)
      return host.conversationCommands.switchAccount(structuredCallerFor(ctx), params)
    }
  })
]
