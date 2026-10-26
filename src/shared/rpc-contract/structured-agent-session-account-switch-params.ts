// Split out of structured-agent-session-params.ts, which is at its line limit.

import { z } from 'zod'
import { Identifier, MutationEnvelope } from './structured-agent-session-params'

/** The account to move the chat to; null is System default. */
export const SwitchAccountParams = z
  .object({
    envelope: MutationEnvelope,
    accountId: Identifier('Invalid account id').nullable()
  })
  .strict()
