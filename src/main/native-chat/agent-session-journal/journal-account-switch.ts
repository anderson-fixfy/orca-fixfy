import {
  AGENT_SESSION_ACCOUNT_SWITCHED_PRESENTATION,
  agentSessionAccountSwitchedText,
  type AgentSessionAccountSwitchRow
} from '../../../shared/agent-session-account-switch'
import type { JournalReducerState } from './journal-reducer'
import { journalItemRowBuilder } from './journal-row-builders'
import type { JournalOperationReceipt, JournalRowWriter } from './journal-row-writer'

/** The "Account switched" divider, written with the record's move in one transaction. Unlike a
 *  clear it sets no floor: the conversation goes on, in the other account. */
export function appendJournalAccountSwitch(input: {
  state: () => JournalReducerState
  writer: JournalRowWriter
  row: AgentSessionAccountSwitchRow
  operationId: string
  fence: number
  receipt: JournalOperationReceipt
}) {
  const { state, row } = input
  return input.writer
    .enqueueRows(
      () => [
        journalItemRowBuilder(
          state,
          { provider: 'orca', clientMessageId: `account-switch:${input.operationId}` },
          {
            kind: 'status',
            text: agentSessionAccountSwitchedText(row.account),
            presentation: AGENT_SESSION_ACCOUNT_SWITCHED_PRESENTATION,
            accountSwitch: { accountId: row.accountId, account: row.account }
          },
          { fence: input.fence, turnScope: { kind: 'thread' } }
        )
      ],
      input.receipt
    )
    .then((rows) => ({
      epoch: state().epoch,
      sequence: rows.at(-1)?.seq ?? state().lastSequence
    }))
}
