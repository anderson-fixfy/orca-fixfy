import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { NativeChatRewindSurface } from './use-native-chat-rewind'
import { NativeChatRewindContext } from './native-chat-rewind-context'
import {
  NativeChatNewChatContext,
  useNativeChatNewChatFromMessage
} from './native-chat-new-chat-from-message'
import { useNativeChatTabOwnerWorktreeId } from './use-native-chat-tab-owner'
import {
  NativeChatEditUserMessageContext,
  editNativeChatUserMessage
} from './native-chat-edit-user-message'

/** What the pane's transcript rows offer: rewind and edit on the user's, a new chat on the agent's. */
export function NativeChatRowActionsProvider({
  chat,
  rewind,
  children
}: {
  chat: Pick<NativeChatStructuredViewProps, 'sessionId' | 'tabId' | 'agent' | 'groupId' | 'target'>
  rewind: NativeChatRewindSurface | undefined
  children: React.ReactNode
}): React.JSX.Element {
  const worktreeId = useNativeChatTabOwnerWorktreeId(chat.tabId)
  const newChat = useNativeChatNewChatFromMessage({
    agent: chat.agent,
    worktreeId,
    groupId: chat.groupId,
    target: chat.target
  })
  const { sessionId, tabId } = chat
  const edit = useMemo(
    () => (message: NativeChatMessage) => editNativeChatUserMessage({ sessionId, tabId }, message),
    [sessionId, tabId]
  )
  return (
    <NativeChatRewindContext.Provider value={rewind}>
      <NativeChatNewChatContext.Provider value={newChat}>
        <NativeChatEditUserMessageContext.Provider value={edit}>
          {children}
        </NativeChatEditUserMessageContext.Provider>
      </NativeChatNewChatContext.Provider>
    </NativeChatRewindContext.Provider>
  )
}
