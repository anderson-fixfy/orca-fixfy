import type { AgentSessionStatusSummary } from '../../shared/agent-session-wire'
import { normalizeAgentSessionConversationName } from '../../shared/agent-session-conversation-name'
import type { AgentSessionRecordStore } from '../runtime/agent-session-record-store'
import type { StructuredAgentSessionStatusObserverOptions } from '../native-chat/agent-session-wire/structured-agent-session-status-observation'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'

const RENAME_PROMPT = /^\/rename\s+(\S.*)$/su

/** The name a `/rename <name>` prompt asks for; a bare `/rename` leaves naming to the agent. */
export function fixfyRenamePromptName(prompt: string): string | null {
  const match = RENAME_PROMPT.exec(prompt.trim())
  return match ? normalizeAgentSessionConversationName(match[1]) : null
}

type FixfyChatRenameDeps = {
  getStore: () => Pick<AgentSessionRecordStore, 'getRecord' | 'setConversationName'> | null
  publish: (sessionId: string) => void
  warn: (sessionId: string, error: unknown) => void
}

/**
 * Names a chat after the `/rename <name>` its user sent, so the tab follows the agent's own session
 * name. Automatic naming compare-and-sets against the name it read, so its seed and generated name
 * lose to this write whenever it lands.
 */
export function createFixfyChatRename(deps: FixfyChatRenameDeps) {
  // The prompt each chat last ran, so a turn's later status updates do not rename it again.
  const ranPrompt = new Map<string, string>()
  return (
    summary: AgentSessionStatusSummary,
    options: StructuredAgentSessionStatusObserverOptions,
    retitleOpenTab: (workspaceId: string, sessionId: string) => void
  ): Promise<void> | undefined => {
    const { sessionId, workspaceId, latestPrompt } = summary
    if (options.replay) {
      ranPrompt.set(sessionId, latestPrompt)
      return
    }
    if (summary.status !== 'working' || ranPrompt.get(sessionId) === latestPrompt) {
      return
    }
    ranPrompt.set(sessionId, latestPrompt)
    const name = fixfyRenamePromptName(latestPrompt)
    const store = deps.getStore()
    const record = name ? store?.getRecord(sessionId) : null
    if (!name || !store || !record || record.conversationName === name) {
      return
    }
    return store.setConversationName(sessionId, name).then(
      () => {
        deps.publish(sessionId)
        retitleOpenTab(workspaceId, sessionId)
      },
      (error: unknown) => deps.warn(sessionId, error)
    )
  }
}

export const fixfyRenameChatOnPrompt = createFixfyChatRename({
  getStore: () => getStructuredAgentSessionHost()?.deps.store ?? null,
  publish: (sessionId) => getStructuredAgentSessionHost()?.publishConversationName(sessionId),
  warn: (sessionId, error) =>
    getStructuredAgentSessionHost()?.deps.logger.warn('Fixfy /rename failed', {
      scope: 'conversation-name',
      sessionId,
      error
    })
})
