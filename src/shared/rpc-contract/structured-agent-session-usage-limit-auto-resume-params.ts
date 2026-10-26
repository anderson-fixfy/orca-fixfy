// Split out of structured-agent-session-params.ts, which is at its line limit.

import { z } from 'zod'
import { SessionId } from './structured-agent-session-params'

/** Schedule Continue on the chat's latest turn, which a usage limit cut. The host reads the reset
 *  time from that turn's own row, so a client names only the turn it saw. */
export const UsageLimitAutoResumeScheduleParams = z
  .object({ sessionId: SessionId, turnItemId: z.string().min(1).max(1024) })
  .strict()

export const UsageLimitAutoResumeCancelParams = z.object({ sessionId: SessionId }).strict()

/** Without a session, every chat's schedule this host keeps. */
export const UsageLimitAutoResumeListParams = z.object({ sessionId: SessionId.optional() }).strict()
