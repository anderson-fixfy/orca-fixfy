import { join } from 'node:path'
import type { NativeChatUsageLimitAutoResume } from '../../shared/native-chat/native-chat-usage-limit-auto-resume'
import { readNodeFileWithinLimit } from '../../shared/node-bounded-file-reader'
import { stringifyJsonWithinByteLimit } from '../../shared/node-bounded-json-stringify'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'
import { withFileTransactionLock } from '../file-transaction-lock'

export const AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_FILE =
  'agent-session-usage-limit-auto-resume.json'
const MAX_FILE_BYTES = 1024 * 1024

/** The chats' scheduled Continues, one per chat, durable across restarts. */
export class AgentSessionUsageLimitAutoResumeFile {
  private readonly filePath: string

  constructor(stateDirectory: string) {
    this.filePath = join(stateDirectory, AGENT_SESSION_USAGE_LIMIT_AUTO_RESUME_FILE)
  }

  read(): Promise<NativeChatUsageLimitAutoResume[]> {
    return withFileTransactionLock(this.filePath, () => this.readEntries())
  }

  /** Read, change and write as one transaction; `change` returns the entries to keep. */
  update<T>(
    change: (entries: NativeChatUsageLimitAutoResume[]) => {
      entries: NativeChatUsageLimitAutoResume[]
      result: T
    }
  ): Promise<T> {
    return withFileTransactionLock(this.filePath, async () => {
      const { entries, result } = change(await this.readEntries())
      const { serialized } = stringifyJsonWithinByteLimit({ version: 1, entries }, MAX_FILE_BYTES)
      await writeFileDurable(durableWriteTempPath(this.filePath), this.filePath, serialized)
      return result
    })
  }

  private async readEntries(): Promise<NativeChatUsageLimitAutoResume[]> {
    let raw: string
    try {
      raw = (await readNodeFileWithinLimit(this.filePath, MAX_FILE_BYTES)).buffer.toString('utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // A torn or foreign file schedules nothing; the next write replaces it.
      return []
    }
    const entries =
      typeof parsed === 'object' && parsed !== null && 'entries' in parsed
        ? parsed.entries
        : undefined
    return Array.isArray(entries) ? entries.flatMap(readEntry) : []
  }
}

function readEntry(value: unknown): NativeChatUsageLimitAutoResume[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const record: Record<string, unknown> = { ...value }
  const { sessionId, turnItemId, resumeAt } = record
  return typeof sessionId === 'string' &&
    typeof turnItemId === 'string' &&
    typeof resumeAt === 'number' &&
    Number.isFinite(resumeAt)
    ? [{ sessionId, turnItemId, resumeAt }]
    : []
}
