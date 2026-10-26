/** Why a chat cannot be forked at a message: the provider cannot fork, the row is not one of its
 *  messages, or its transcript has not saved the message yet. */
export type AgentSessionMessageForkReason = 'unsupported' | 'invalid-target' | 'not-saved'

export type AgentSessionMessageForkResult =
  | { ok: true; providerSessionId: string }
  | { ok: false; reason: AgentSessionMessageForkReason }
