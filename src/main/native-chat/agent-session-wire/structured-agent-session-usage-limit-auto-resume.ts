// Resume automatically: the host sends a chat's usage-limit Continue once the limit resets.
// One schedule per chat, bound to the cut turn and kept on disk; it fires once, and only while the
// chat still sits on that cut, so any message sent since cancels it.

import {
  nativeChatUsageLimitAutoResumeAt,
  type NativeChatUsageLimitAutoResume
} from '../../../shared/native-chat/native-chat-usage-limit-auto-resume'
import type { StructuredAgentSessionLogger } from './structured-agent-session-logger'

/** Wall-clock checks this often: a monotonic timer stalls while the machine sleeps. */
const CHECK_INTERVAL_MS = 60_000

export type StructuredAgentSessionUsageLimitAutoResumeDeps = {
  file: {
    read: () => Promise<NativeChatUsageLimitAutoResume[]>
    update: <T>(
      change: (entries: NativeChatUsageLimitAutoResume[]) => {
        entries: NativeChatUsageLimitAutoResume[]
        result: T
      }
    ) => Promise<T>
  }
  /** The chat's latest usage-limit cut; null when it moved on or cannot be read. */
  readCut: (sessionId: string) => Promise<{ turnItemId: string; resetsAt?: number } | null>
  /** The Continue the row's button sends, bound to the cut turn. */
  sendContinue: (sessionId: string, turnItemId: string) => Promise<void>
  now: () => number
  logger: StructuredAgentSessionLogger
}

export type StructuredAgentSessionUsageLimitAutoResume = {
  /** Arms what the file holds; a schedule that came due while Orca was closed fires now. */
  start: () => Promise<void>
  stop: () => void
  /** Null when the chat no longer sits on that cut, or its limit gave no reset time. */
  schedule: (
    sessionId: string,
    turnItemId: string
  ) => Promise<NativeChatUsageLimitAutoResume | null>
  cancel: (sessionId: string) => Promise<void>
  list: (sessionId?: string) => Promise<NativeChatUsageLimitAutoResume[]>
}

export function createStructuredAgentSessionUsageLimitAutoResume(
  deps: StructuredAgentSessionUsageLimitAutoResumeDeps
): StructuredAgentSessionUsageLimitAutoResume {
  let known: readonly NativeChatUsageLimitAutoResume[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let firing: Promise<void> | null = null

  const stillCut = async (entry: NativeChatUsageLimitAutoResume): Promise<boolean> => {
    const cut = await deps.readCut(entry.sessionId).catch(() => null)
    return cut?.turnItemId === entry.turnItemId
  }

  const arm = (): void => {
    clearTimeout(timer)
    timer = undefined
    if (stopped || known.length === 0) {
      return
    }
    const next = Math.min(...known.map((entry) => entry.resumeAt))
    const delay = Math.max(0, Math.min(next - deps.now(), CHECK_INTERVAL_MS))
    timer = setTimeout(() => {
      timer = undefined
      void fireDue()
    }, delay)
  }

  const write = <T>(
    change: (entries: NativeChatUsageLimitAutoResume[]) => {
      entries: NativeChatUsageLimitAutoResume[]
      result: T
    }
  ): Promise<T> =>
    deps.file.update((entries) => {
      const changed = change(entries)
      known = changed.entries
      return changed
    })

  const sendDue = async (): Promise<void> => {
    if (!known.some((entry) => entry.resumeAt <= deps.now())) {
      return
    }
    // Off the disk before sending, so a crash mid-send never sends twice.
    const due = await write((entries) => {
      const now = deps.now()
      return {
        entries: entries.filter((entry) => entry.resumeAt > now),
        result: entries.filter((entry) => entry.resumeAt <= now)
      }
    })
    for (const entry of due) {
      if (stopped || !(await stillCut(entry))) {
        continue
      }
      await deps.sendContinue(entry.sessionId, entry.turnItemId).catch((error: unknown) => {
        deps.logger.warn('resuming a chat after its usage limit failed', {
          scope: 'usage-limit-auto-resume',
          sessionId: entry.sessionId,
          error
        })
      })
    }
  }

  const fireDue = (): Promise<void> => {
    firing ??= sendDue()
      .catch((error: unknown) => {
        deps.logger.warn('writing the usage-limit auto-resume schedule failed', {
          scope: 'usage-limit-auto-resume',
          error
        })
      })
      .finally(() => {
        firing = null
        arm()
      })
    return firing
  }

  const withoutSession = (entries: NativeChatUsageLimitAutoResume[], sessionId: string) =>
    entries.filter((entry) => entry.sessionId !== sessionId)

  return {
    start: async () => {
      try {
        known = await deps.file.read()
      } catch (error) {
        deps.logger.warn('reading the usage-limit auto-resume schedule failed', {
          scope: 'usage-limit-auto-resume',
          error
        })
        return
      }
      await fireDue()
    },
    stop: () => {
      stopped = true
      clearTimeout(timer)
      timer = undefined
    },
    schedule: async (sessionId, turnItemId) => {
      const cut = await deps.readCut(sessionId)
      if (cut?.turnItemId !== turnItemId || cut.resetsAt === undefined) {
        return null
      }
      const entry = {
        sessionId,
        turnItemId,
        resumeAt: nativeChatUsageLimitAutoResumeAt(cut.resetsAt)
      }
      await write((entries) => ({
        entries: [...withoutSession(entries, sessionId), entry],
        result: undefined
      }))
      arm()
      return entry
    },
    cancel: async (sessionId) => {
      await write((entries) => ({ entries: withoutSession(entries, sessionId), result: undefined }))
      arm()
    },
    list: async (sessionId) => {
      const entries = (await deps.file.read()).filter(
        (entry) => sessionId === undefined || entry.sessionId === sessionId
      )
      const kept: NativeChatUsageLimitAutoResume[] = []
      const moved: NativeChatUsageLimitAutoResume[] = []
      for (const entry of entries) {
        if (await stillCut(entry)) {
          kept.push(entry)
        } else {
          moved.push(entry)
        }
      }
      if (moved.length > 0) {
        // Exact matches only: a schedule made while this read ran stays.
        await write((current) => ({
          entries: current.filter(
            (entry) =>
              !moved.some(
                (gone) =>
                  gone.sessionId === entry.sessionId &&
                  gone.turnItemId === entry.turnItemId &&
                  gone.resumeAt === entry.resumeAt
              )
          ),
          result: undefined
        }))
        arm()
      }
      return kept
    }
  }
}
