import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { parseClaudeSourceBlockId } from './claude-streamed-block-identity'
import { claudeConfigDirsForRecord, findClaudeTranscriptRow } from './claude-rewind-fork'
import { forkClaudeTranscript } from './claude-rewind-transcript'

type TranscriptRow = { uuid: string }

function hasUuid(value: unknown): value is Record<string, unknown> & TranscriptRow {
  return (
    typeof value === 'object' && value !== null && 'uuid' in value && typeof value.uuid === 'string'
  )
}

/** A streamed row is keyed by its API block, which the transcript saves as `message.id` plus
 *  `apiBlockIndex`; any other row by its own transcript uuid. */
function transcriptRowOf(uuid: string): {
  needle: string
  matches: (value: unknown) => value is TranscriptRow
} {
  const block = parseClaudeSourceBlockId(uuid)
  if (!block) {
    return {
      needle: uuid,
      matches: (value): value is TranscriptRow => hasUuid(value) && value.uuid === uuid
    }
  }
  return {
    needle: block.messageId,
    matches: (value): value is TranscriptRow =>
      hasUuid(value) &&
      value.type === 'assistant' &&
      value.apiBlockIndex === block.index &&
      typeof value.message === 'object' &&
      value.message !== null &&
      'id' in value.message &&
      value.message.id === block.messageId
  }
}

/** The new session's id, or null when no account's transcript has saved the message yet. */
export async function resolveClaudeMessageFork(input: {
  message: { sessionId: string; uuid: string }
  claudeConfigDirs: readonly string[]
}): Promise<string | null> {
  const { needle, matches } = transcriptRowOf(input.message.uuid)
  for (const claudeConfigDir of new Set(input.claudeConfigDirs)) {
    const found = await findClaudeTranscriptRow(
      { providerSessionId: input.message.sessionId, claudeConfigDir },
      needle,
      matches
    )
    if (found) {
      const fork = await forkClaudeTranscript(found.path, input.message.sessionId, found.row.uuid)
      return fork.sessionId
    }
  }
  return null
}

export const claudeForkThroughMessage: NonNullable<
  StructuredAgentSessionAdapter['forkThroughMessage']
> = async ({ record, message }) => {
  const providerSessionId = await resolveClaudeMessageFork({
    message,
    claudeConfigDirs: claudeConfigDirsForRecord(record)
  })
  return providerSessionId ? { ok: true, providerSessionId } : { ok: false, reason: 'not-saved' }
}
