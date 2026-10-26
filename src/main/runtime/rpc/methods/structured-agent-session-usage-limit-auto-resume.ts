// Resume automatically after a usage limit: schedule, cancel and list the host's Continue.
// Clients gate these on AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_RUNTIME_CAPABILITY. Each names one chat
// the client shows, as a send does, so no agent audience applies.

import { defineMethod } from '../core'
import {
  ensureStructuredHostInstalled,
  requireStructuredHost
} from './structured-agent-session-gate'
import {
  UsageLimitAutoResumeCancelParams,
  UsageLimitAutoResumeListParams,
  UsageLimitAutoResumeScheduleParams
} from '../../../../shared/rpc-contract/structured-agent-session-usage-limit-auto-resume-params'
import { structuredAgentSessionUsageLimitAutoResumeOf } from '../../../native-chat/agent-session-wire/structured-agent-session-usage-limit-auto-resume-host'
import type { RpcContext } from '../core'

async function autoResumeFor(ctx: RpcContext) {
  await ensureStructuredHostInstalled(ctx)
  return structuredAgentSessionUsageLimitAutoResumeOf(requireStructuredHost(ctx))
}

export const STRUCTURED_AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_METHODS = [
  defineMethod({
    // `resume` is null when the chat moved on from that cut, or its limit gave no reset time.
    name: 'agentSession.usageLimitAutoResume',
    permission: 'workspace',
    params: UsageLimitAutoResumeScheduleParams,
    handler: async (params, ctx) => ({
      resume:
        (await (await autoResumeFor(ctx))?.schedule(params.sessionId, params.turnItemId)) ?? null
    })
  }),
  defineMethod({
    name: 'agentSession.usageLimitAutoResumeCancel',
    permission: 'workspace',
    params: UsageLimitAutoResumeCancelParams,
    handler: async (params, ctx) => {
      await (await autoResumeFor(ctx))?.cancel(params.sessionId)
      return { cancelled: true }
    }
  }),
  defineMethod({
    name: 'agentSession.usageLimitAutoResumeList',
    permission: 'workspace',
    params: UsageLimitAutoResumeListParams,
    handler: async (params, ctx) => ({
      resumes: (await (await autoResumeFor(ctx))?.list(params.sessionId)) ?? []
    })
  })
]
