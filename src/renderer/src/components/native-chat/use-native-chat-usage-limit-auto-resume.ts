import { useCallback, useEffect, useMemo, useState } from 'react'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import { useStructuredAgentSessionHostCapabilityState } from '@/runtime/structured-agent-session-host-capability'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import {
  AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_RUNTIME_CAPABILITY,
  nativeChatUsageLimitAutoResumeAt
} from '../../../../shared/native-chat/native-chat-usage-limit-auto-resume'

/** Resume automatically, on the row of a usage limit that gave its reset time. */
export type NativeChatUsageLimitAutoResumeView = {
  turnItemId: string
  /** When the host sends Continue; null until it is scheduled. */
  resumeAt: number | null
  /** When it would, before it is scheduled. */
  plannedAt: number
  busy: boolean
  schedule: () => void
  cancel: () => void
}

type Scheduled = { turnItemId: string; resumeAt: number }

/** The host's schedule for this cut, if it lists one. */
function scheduledFor(value: unknown, turnItemId: string): Scheduled | null {
  const entries = Array.isArray(value) ? value : [value]
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const record: Record<string, unknown> = { ...entry }
    if (record.turnItemId === turnItemId && typeof record.resumeAt === 'number') {
      return { turnItemId, resumeAt: record.resumeAt }
    }
  }
  return null
}

/**
 * Null with no button to show: the host lacks the schedule, the chat is not on a usage-limit cut,
 * or the limit gave no reset time. The host keeps the schedule, so this side only reads and asks.
 */
export function useNativeChatUsageLimitAutoResume(
  target: RuntimeClientTarget,
  sessionId: string,
  cut: { turnItemId: string; resetsAt?: number } | null
): NativeChatUsageLimitAutoResumeView | null {
  const capability = useStructuredAgentSessionHostCapabilityState(
    target,
    AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_RUNTIME_CAPABILITY
  )
  const resetsAt = cut?.resetsAt
  const turnItemId =
    capability === 'supported' && cut && resetsAt !== undefined ? cut.turnItemId : null
  const [scheduled, setScheduled] = useState<Scheduled | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (turnItemId === null) {
      return
    }
    let current = true
    void callStructuredAgentSession<{ resumes?: unknown }>(
      target,
      'agentSession.usageLimitAutoResumeList',
      { sessionId }
    ).then(
      (answer) => {
        if (current) {
          setScheduled(scheduledFor(answer.resumes, turnItemId))
        }
      },
      () => {}
    )
    return () => {
      current = false
    }
  }, [target, sessionId, turnItemId])
  const schedule = useCallback((): void => {
    if (turnItemId === null) {
      return
    }
    setBusy(true)
    void callStructuredAgentSession<{ resume?: unknown }>(
      target,
      'agentSession.usageLimitAutoResume',
      { sessionId, turnItemId }
    )
      .then((answer) => setScheduled(scheduledFor(answer.resume, turnItemId)))
      .catch(() => {})
      .finally(() => setBusy(false))
  }, [target, sessionId, turnItemId])
  const cancel = useCallback((): void => {
    setBusy(true)
    void callStructuredAgentSession(target, 'agentSession.usageLimitAutoResumeCancel', {
      sessionId
    })
      .then(() => setScheduled(null))
      .catch(() => {})
      .finally(() => setBusy(false))
  }, [target, sessionId])
  const resumeAt = scheduled?.turnItemId === turnItemId ? scheduled.resumeAt : null
  // One object per change, so the chat's rows re-render only when what they show changes.
  return useMemo(
    () =>
      turnItemId === null || resetsAt === undefined
        ? null
        : {
            turnItemId,
            resumeAt,
            plannedAt: nativeChatUsageLimitAutoResumeAt(resetsAt),
            busy,
            schedule,
            cancel
          },
    [turnItemId, resetsAt, resumeAt, busy, schedule, cancel]
  )
}
