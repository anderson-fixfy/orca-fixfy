// A chapter is a prompt and the agent's answer to it: one turn, keyed by the turn key.
// Every chapter starts pinned, so a session only records the ones its reader unpinned.
// The record lives in the renderer for the app's lifetime, outliving the pane that drew it.

import { createContext, useMemo, useSyncExternalStore } from 'react'

export type NativeChatPinnedChapters = {
  isPinned: (chapterKey: string) => boolean
  toggle: (chapterKey: string) => void
}

/** Absent where the pane keeps no pins: nothing offers the toggle or marks the rail. */
export const NativeChatPinnedChaptersContext = createContext<NativeChatPinnedChapters | undefined>(
  undefined
)

const NONE_UNPINNED: ReadonlySet<string> = new Set()
const unpinnedBySession = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function toggleNativeChatChapterPin(sessionKey: string, chapterKey: string): void {
  const unpinned = new Set(unpinnedBySession.get(sessionKey))
  if (!unpinned.delete(chapterKey)) {
    unpinned.add(chapterKey)
  }
  unpinnedBySession.set(sessionKey, unpinned)
  for (const listener of listeners) {
    listener()
  }
}

export function useNativeChatPinnedChapters(sessionKey: string): NativeChatPinnedChapters {
  const read = (): ReadonlySet<string> => unpinnedBySession.get(sessionKey) ?? NONE_UNPINNED
  const unpinned = useSyncExternalStore(subscribe, read, read)
  return useMemo(
    () => ({
      isPinned: (chapterKey) => !unpinned.has(chapterKey),
      toggle: (chapterKey) => toggleNativeChatChapterPin(sessionKey, chapterKey)
    }),
    [sessionKey, unpinned]
  )
}
