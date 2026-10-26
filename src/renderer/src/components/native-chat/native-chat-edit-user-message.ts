import { createContext } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { structuredAgentSessionDraftScopeKey } from './native-chat-composer-draft-store'
import { returnMessageToComposer } from './structured-agent-session-message-hand-back'
import { requestNativeChatComposerFocus } from './use-native-chat-composer-reveal-focus'

/** Puts a sent message in the chat's composer, after whatever is typed there, and focuses it. */
export type NativeChatEditUserMessage = (message: NativeChatMessage) => void

/** Absent where the pane has no structured composer to edit in. */
export const NativeChatEditUserMessageContext = createContext<
  NativeChatEditUserMessage | undefined
>(undefined)

export function editNativeChatUserMessage(
  chat: { sessionId: string; tabId: string },
  message: NativeChatMessage
): void {
  // The same give-back as Stop and rewind, so the composer shows it however it renders its draft.
  returnMessageToComposer(
    structuredAgentSessionDraftScopeKey(chat.sessionId),
    `edited-${message.id}`,
    message.blocks
  )
  requestNativeChatComposerFocus(chat.tabId)
}
