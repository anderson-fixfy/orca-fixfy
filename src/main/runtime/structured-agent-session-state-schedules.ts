// Split out of structured-agent-session-runtime.ts, which is at its line limit.

import type { AgentSessionRecordStore } from './agent-session-record-store'
import type { StructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-host'
import { installStructuredAgentSessionUsageLimitAutoResume } from '../native-chat/agent-session-wire/structured-agent-session-usage-limit-auto-resume-host'
import { scheduleNativeChatVisualsSweep } from '../native-chat/native-chat-visuals-sweep'
import { AgentSessionUsageLimitAutoResumeFile } from './agent-session-usage-limit-auto-resume-file'

/** The host's timed work over its state directory: the visuals sweep and the usage-limit
 *  auto-resume, which fires a Continue that came due while Orca was closed. Returns the stop. */
export function startStructuredAgentSessionStateSchedules(input: {
  host: StructuredAgentSessionHost
  store: Pick<AgentSessionRecordStore, 'readOnly' | 'listHeldSessionIds'>
  deps: { stateDirectory: string; nativeChatVisuals?: unknown }
}): () => void {
  const { host, store, deps } = input
  const stopVisualsSweep = deps.nativeChatVisuals
    ? scheduleNativeChatVisualsSweep({
        stateDirectory: deps.stateDirectory,
        listHeldSessionIds: () => (store.readOnly ? null : store.listHeldSessionIds()),
        logger: host.deps.logger
      })
    : undefined
  const autoResume = installStructuredAgentSessionUsageLimitAutoResume(
    host,
    new AgentSessionUsageLimitAutoResumeFile(deps.stateDirectory)
  )
  void autoResume.start()
  return () => {
    autoResume.stop()
    stopVisualsSweep?.()
  }
}
