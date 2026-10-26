import {
  NativeChatDisclosureContext,
  type NativeChatDisclosureStore
} from './native-chat-disclosure-store'
import {
  NativeChatPinnedChaptersContext,
  type NativeChatPinnedChapters
} from './native-chat-pinned-chapters'

/** What the transcript's rows and its rail read: open disclosures and pinned chapters. */
export function NativeChatTranscriptContexts({
  disclosures,
  pinnedChapters,
  children
}: {
  disclosures: NativeChatDisclosureStore
  pinnedChapters: NativeChatPinnedChapters
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <NativeChatDisclosureContext.Provider value={disclosures}>
      <NativeChatPinnedChaptersContext.Provider value={pinnedChapters}>
        {children}
      </NativeChatPinnedChaptersContext.Provider>
    </NativeChatDisclosureContext.Provider>
  )
}
