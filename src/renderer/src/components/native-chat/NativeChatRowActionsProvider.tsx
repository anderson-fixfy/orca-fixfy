import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { NativeChatRewindSurface } from './use-native-chat-rewind'
import { NativeChatRewindContext } from './native-chat-rewind-context'
import {
  NativeChatNewChatContext,
  useNativeChatNewChatFromMessage
} from './native-chat-new-chat-from-message'
import { useNativeChatTabOwnerWorktreeId } from './use-native-chat-tab-owner'

/** What the pane's transcript rows offer: rewind on the user's, a new chat on the agent's. */
export function NativeChatRowActionsProvider({
  chat,
  rewind,
  children
}: {
  chat: Pick<NativeChatStructuredViewProps, 'tabId' | 'agent' | 'groupId' | 'target'>
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
  return (
    <NativeChatRewindContext.Provider value={rewind}>
      <NativeChatNewChatContext.Provider value={newChat}>
        {children}
      </NativeChatNewChatContext.Provider>
    </NativeChatRewindContext.Provider>
  )
}
