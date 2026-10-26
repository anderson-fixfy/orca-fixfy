import type { AgentSessionMutationEnvelope } from './agent-session-wire'

/** A chat moved to another of its agent's accounts, in the same tab and Orca session; its next
 *  launch resumes the conversation there instead of following the account selection. */

/** `accountId` null is System default. */
export type AgentSessionAccountSwitchParams = {
  envelope: AgentSessionMutationEnvelope
  accountId: string | null
}

export type AgentSessionAccountSwitchResult = {
  accountId: string | null
  /** The login the chat now runs on, as its divider names it. */
  account: string
}

/** The record's pin: launches run on this account whatever the selection. */
export type AgentSessionAccountSwitchRecord = AgentSessionAccountSwitchResult & {
  operationId: string
  callerKey: string
  switchedAt: number
}

/** The divider's journal fields; `text` stays the sentence older clients and the phone print. */
export type AgentSessionAccountSwitchRow = AgentSessionAccountSwitchResult

export const AGENT_SESSION_ACCOUNT_SWITCHED_PRESENTATION = 'account-switched'

export function agentSessionAccountSwitchedText(account: string): string {
  return `Account switched - ${account}`
}

const MAX_KEY_LENGTH = 512
const MAX_ACCOUNT_LENGTH = 1024

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

export function isAgentSessionAccountSwitchResult(
  value: unknown
): value is AgentSessionAccountSwitchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accountId' in value &&
    (value.accountId === null || isBoundedString(value.accountId, MAX_KEY_LENGTH)) &&
    'account' in value &&
    isBoundedString(value.account, MAX_ACCOUNT_LENGTH)
  )
}

export function isAgentSessionAccountSwitchRecord(
  value: unknown
): value is AgentSessionAccountSwitchRecord {
  return (
    isAgentSessionAccountSwitchResult(value) &&
    'operationId' in value &&
    isBoundedString(value.operationId, MAX_KEY_LENGTH) &&
    'callerKey' in value &&
    isBoundedString(value.callerKey, MAX_KEY_LENGTH) &&
    'switchedAt' in value &&
    typeof value.switchedAt === 'number' &&
    Number.isSafeInteger(value.switchedAt) &&
    value.switchedAt >= 0
  )
}
