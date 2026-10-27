import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { AgentSessionAccountSwitchResult } from '../../../../shared/agent-session-account-switch'
import type { AgentSessionStatusSummary } from '../../../../shared/agent-session-wire'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/structured-agent-session-status-feed'

export function useStructuredAgentSessionStatusSummary(
  sessionId: string,
  target: RuntimeClientTarget
): { summary: AgentSessionStatusSummary | null; observation: 'live' | 'unverifiable' } {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  const summary = useSyncExternalStore(
    feed.subscribe,
    () => feed.getSnapshot().get(sessionId) ?? null,
    () => null
  )
  const observation = useSyncExternalStore(
    feed.subscribe,
    () => feed.getSessionObservation(sessionId),
    () => 'unverifiable' as const
  )
  return { summary, observation }
}

/** The host status's option values as one stamp: another device's pick moves it, so options re-read. */
export function useStructuredAgentSessionOptionStamp(
  sessionId: string,
  target: RuntimeClientTarget
): string {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  return useSyncExternalStore(
    feed.subscribe,
    () => {
      const summary = feed.getSnapshot().get(sessionId)
      return `${summary?.model ?? ''}|${summary?.permissionMode ?? ''}`
    },
    () => ''
  )
}

/** Subscribe only to startup phase changes, avoiding unrelated status renders. */
export function useStructuredAgentSessionHostExecutionPhase(
  sessionId: string,
  target: RuntimeClientTarget
): NonNullable<AgentSessionStatusSummary['hostExecutionPhase']> | null {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  return useSyncExternalStore(
    feed.subscribe,
    () => feed.getSnapshot().get(sessionId)?.hostExecutionPhase ?? null,
    () => null
  )
}

/** Whether the host says a person's Stop is still ending the work; an older host never does. */
export function useStructuredAgentSessionHostStopping(
  sessionId: string,
  target: RuntimeClientTarget
): boolean {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  return useSyncExternalStore(
    feed.subscribe,
    () => feed.getSnapshot().get(sessionId)?.stopping === true,
    () => false
  )
}

export function useStructuredAgentSessionHostExecution(
  sessionId: string,
  target: RuntimeClientTarget
): {
  phase: ReturnType<typeof useStructuredAgentSessionHostExecutionPhase>
  stopping: boolean
  optionStamp: string
} {
  return {
    phase: useStructuredAgentSessionHostExecutionPhase(sessionId, target),
    stopping: useStructuredAgentSessionHostStopping(sessionId, target),
    optionStamp: useStructuredAgentSessionOptionStamp(sessionId, target)
  }
}

/** Subscribe only to rewind recovery changes, avoiding unrelated status renders. */
export function useStructuredAgentSessionRewindBlockedReason(
  sessionId: string,
  target: RuntimeClientTarget
): NonNullable<AgentSessionStatusSummary['rewindBlockedReason']> | null {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  return useSyncExternalStore(
    feed.subscribe,
    () => feed.getSnapshot().get(sessionId)?.rewindBlockedReason ?? null,
    () => null
  )
}

/** The account a person switched this chat to; null while it follows the selected account. */
export function useStructuredAgentSessionAccountSwitch(
  sessionId: string,
  target: RuntimeClientTarget
): AgentSessionAccountSwitchResult | null {
  const feed = useMemo(() => getStructuredAgentSessionStatusFeed(target), [target])
  useEffect(() => feed.activate(), [feed])
  // One string, so a status that leaves the account alone does not re-render the chat.
  const key = useSyncExternalStore(
    feed.subscribe,
    () => {
      const switched = feed.getSnapshot().get(sessionId)?.accountSwitch
      return switched ? `${switched.accountId ?? ''}\u0000${switched.account}` : ''
    },
    () => ''
  )
  return useMemo(() => {
    if (!key) {
      return null
    }
    const [accountId = '', account = ''] = key.split('\u0000')
    return { accountId: accountId || null, account }
  }, [key])
}
