import { createContext, useMemo } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session-launch-plan'
import { beginStructuredAgentSessionProvisionalLaunch } from '@/lib/agent-session/structured-agent-session-provisional-tab'
import { forkStructuredAgentSessionThroughMessage } from '@/runtime/structured-agent-session-client'
import { useStructuredAgentSessionHostCapabilityState } from '@/runtime/structured-agent-session-host-capability'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { captureNativeChatComposerFocusIntent } from './use-native-chat-composer-reveal-focus'
import { STRUCTURED_AGENT_SESSION_MESSAGE_FORK_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

/** Opens a new chat that continues the conversation as it stood at the given agent message. */
export type NativeChatForkFromMessage = (messageId: string) => Promise<void>

/** Absent where the pane's chat cannot be forked. */
export const NativeChatForkContext = createContext<NativeChatForkFromMessage | undefined>(undefined)

type NativeChatForkSource = {
  sessionId: string
  target: RuntimeClientTarget
  tabId: string
  worktreeId: string
  executionHostId: ExecutionHostId
}

function notifyForkFailure(notSaved = false): void {
  toast.error(
    notSaved
      ? translate(
          'components.native-chat.forkFromMessageNotSaved',
          "Claude hasn't saved this message yet. Try again in a moment."
        )
      : translate('components.native-chat.forkFromMessageFailed', 'Could not fork this chat.')
  )
}

export async function forkNativeChatFromMessage(
  source: NativeChatForkSource,
  messageId: string
): Promise<void> {
  const focusIntent = captureNativeChatComposerFocusIntent()
  const fork = await forkStructuredAgentSessionThroughMessage(
    source.target,
    source.sessionId,
    messageId
  ).catch(() => null)
  if (!fork?.ok) {
    focusIntent.cancel()
    notifyForkFailure(fork?.reason === 'not-saved')
    return
  }
  const launch = beginStructuredAgentSessionProvisionalLaunch({
    plan: adoptAgentSessionLaunchVerdict({
      route: 'structured-native-chat',
      requestId: newAgentLaunchRequestId(),
      agent: 'claude',
      worktreeId: source.worktreeId,
      executionHostId: source.executionHostId,
      resumeFrom: { providerSessionId: fork.providerSessionId }
    }),
    hooks: {},
    afterTabId: source.tabId,
    focusIntent
  })
  if (!launch) {
    notifyForkFailure()
    return
  }
  void launch.settlement.then((settlement) => {
    if (settlement.kind === 'failed' && !settlement.notified) {
      notifyForkFailure()
    }
  })
}

/** Only Claude chats fork, and only on a host that has the fork method. */
export function useNativeChatForkFromMessage(args: {
  agent: AgentType
  sessionId: string
  tabId: string
  worktreeId: string | null
  target: RuntimeClientTarget
}): NativeChatForkFromMessage | undefined {
  const { agent, sessionId, tabId, worktreeId, target } = args
  const support = useStructuredAgentSessionHostCapabilityState(
    target,
    STRUCTURED_AGENT_SESSION_MESSAGE_FORK_RUNTIME_CAPABILITY
  )
  const executionHostId = executionHostIdForStructuredTarget(target)
  return useMemo(() => {
    if (agent !== 'claude' || !worktreeId || support !== 'supported') {
      return undefined
    }
    const source = { sessionId, target, tabId, worktreeId, executionHostId }
    return (messageId: string) => forkNativeChatFromMessage(source, messageId)
  }, [agent, sessionId, tabId, worktreeId, support, target, executionHostId])
}
