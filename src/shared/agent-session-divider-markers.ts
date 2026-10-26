import type { AgentSessionAccountSwitchRow } from './agent-session-account-switch'
import type { AgentSessionProviderContextBoundary } from './agent-session-provider-context'

/** What a divider row carries beside its words: the clear it marks, or where a switch moved. */
export type AgentSessionDividerMarkers = {
  contextClear?: AgentSessionProviderContextBoundary
  /** On the divider a switch writes: the account the chat moved to. */
  accountSwitch?: AgentSessionAccountSwitchRow
}
