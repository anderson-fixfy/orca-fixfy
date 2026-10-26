import { agentSessionRefusalError } from '../../shared/agent-session-wire-refusals'
import type { AgentSessionAccountHome } from '../../shared/agent-session-account-home'
import type { AgentSessionAccountSwitchRecord } from '../../shared/agent-session-account-switch'
import type { AgentSessionStoreState } from './agent-session-store-state'

export type AgentSessionAccountSwitch = {
  sessionId: string
  fence: number
  accountHome: AgentSessionAccountHome
  accountSwitch: AgentSessionAccountSwitchRecord
}

/** The one writer of a session's account: a reservation that names another account is still a
 *  conflict, so only a switch, with no process running, moves the chat to it. */
export function commitAccountSwitchRecord(
  state: AgentSessionStoreState,
  change: AgentSessionAccountSwitch
): void {
  const source = state.records.get(change.sessionId)
  if (!source || source.lease.runtimeFence !== change.fence) {
    throw agentSessionRefusalError('agent_session_checkpoint_stale', { reason: 'leaseMoved' })
  }
  if (source.lease.ownerProcess !== null || source.lease.claimStatus !== 'released') {
    throw agentSessionRefusalError('agent_session_ownership_unknown', { reason: 'leaseMoved' })
  }
  state.records.set(change.sessionId, {
    ...source,
    accountHome: change.accountHome,
    accountSwitch: change.accountSwitch,
    updatedAt: change.accountSwitch.switchedAt
  })
}
