import { createContext, useMemo } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { captureNativeChatComposerFocusIntent } from './use-native-chat-composer-reveal-focus'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { TuiAgent } from '../../../../shared/tui-agent'

/** Opens a new chat whose composer holds the given agent message, unsent. */
export type NativeChatNewChatFromMessage = (text: string) => void

/** Absent where the pane cannot open a chat beside itself. */
export const NativeChatNewChatContext = createContext<NativeChatNewChatFromMessage | undefined>(
  undefined
)

type NativeChatNewChatSource = {
  agent: TuiAgent
  worktreeId: string
  groupId?: string
  executionHostId: ExecutionHostId
}

export function openNativeChatNewChatFromMessage(
  source: NativeChatNewChatSource,
  text: string
): void {
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    focusIntent: captureNativeChatComposerFocusIntent(),
    requestedSurface: 'chat',
    selectedExecutionHostId: source.executionHostId,
    agent: source.agent,
    worktreeId: source.worktreeId,
    ...(source.groupId ? { groupId: source.groupId } : {}),
    prompt: text,
    // The chat route seeds the composer without the terminal mirror's line cap.
    promptDelivery: 'draft'
  })
  if (!result) {
    toast.error(
      translate(
        'auto.components.tab.bar.QuickLaunchButton.465e432ef1',
        'Could not build launch command for {{value0}}.',
        { value0: getAgentLabel(source.agent) }
      )
    )
  }
}

export function useNativeChatNewChatFromMessage(args: {
  agent: AgentType
  worktreeId: string | null
  groupId?: string
  target: RuntimeClientTarget
}): NativeChatNewChatFromMessage | undefined {
  const { agent, worktreeId, groupId } = args
  // A primitive, so a re-created target object does not re-render every row's controls.
  const executionHostId = executionHostIdForStructuredTarget(args.target)
  return useMemo(() => {
    if (!worktreeId || !isTuiAgent(agent)) {
      return undefined
    }
    const source = { agent, worktreeId, ...(groupId ? { groupId } : {}), executionHostId }
    return (text: string) => openNativeChatNewChatFromMessage(source, text)
  }, [agent, worktreeId, groupId, executionHostId])
}
