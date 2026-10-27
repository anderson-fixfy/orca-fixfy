import type { AgentSessionStatusSummary } from '../../shared/agent-session-wire'
import { normalizeAgentSessionConversationName } from '../../shared/agent-session/agent-session-conversation-name'
import type { StructuredAgentSessionStatusObserverOptions } from '../native-chat/agent-session-wire/structured-agent-session-status-observation'
import type { SetUserConversationName } from '../native-chat/agent-session-wire/structured-agent-session-host-types'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'

const RENAME_PROMPT = /^\/rename\s+(\S.*)$/su

/** The name a `/rename <name>` prompt asks for; a bare `/rename` leaves naming to the agent. */
export function fixfyRenamePromptName(prompt: string): string | null {
  const match = RENAME_PROMPT.exec(prompt.trim())
  return match ? normalizeAgentSessionConversationName(match[1]) : null
}

type FixfyChatRenameDeps = {
  setUserName: (sessionId: string, name: string) => ReturnType<SetUserConversationName>
  warn: (sessionId: string, error: unknown) => void
}

/**
 * Names a chat after the `/rename <name>` its user sent, so the tab follows the agent's own session
 * name. It is the user's name, as a tab rename is: automatic naming and `/clear` keep it.
 */
export function createFixfyChatRename(deps: FixfyChatRenameDeps) {
  // The prompt each chat last ran, so a turn's later status updates do not rename it again.
  const ranPrompt = new Map<string, string>()
  return (
    summary: AgentSessionStatusSummary,
    options: StructuredAgentSessionStatusObserverOptions
  ): Promise<void> | undefined => {
    const { sessionId, latestPrompt } = summary
    if (options.replay) {
      ranPrompt.set(sessionId, latestPrompt)
      return
    }
    if (summary.status !== 'working' || ranPrompt.get(sessionId) === latestPrompt) {
      return
    }
    ranPrompt.set(sessionId, latestPrompt)
    const name = fixfyRenamePromptName(latestPrompt)
    if (!name) {
      return
    }
    return deps.setUserName(sessionId, name).then(
      () => undefined,
      (error: unknown) => deps.warn(sessionId, error)
    )
  }
}

export const fixfyRenameChatOnPrompt = createFixfyChatRename({
  setUserName: async (sessionId, name) =>
    (await getStructuredAgentSessionHost()?.setUserConversationName(sessionId, name, 'rename')) ??
    null,
  warn: (sessionId, error) =>
    getStructuredAgentSessionHost()?.deps.logger.warn('Fixfy /rename failed', {
      scope: 'conversation-name',
      sessionId,
      error
    })
})
