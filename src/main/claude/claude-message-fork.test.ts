import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeSourceBlockId } from './claude-streamed-block-identity'
import { resolveClaudeMessageFork } from './claude-message-fork'

let root: string
let home: string
let project: string
let source: string
let path: string
let original: string
let answer: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-message-fork-'))
  home = join(root, 'account')
  project = join(home, 'projects', 'workspace')
  await mkdir(project, { recursive: true })
  source = randomUUID()
  path = join(project, `${source}.jsonl`)
  const [prompt, thought, nextPrompt, nextAnswer] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID()
  ]
  answer = randomUUID()
  const assistant = (
    uuid: string,
    parentUuid: string,
    id: string,
    index: number,
    part: object
  ) => ({
    type: 'assistant',
    uuid,
    parentUuid,
    apiBlockIndex: index,
    message: { id, role: 'assistant', content: [part] }
  })
  const entries = [
    { type: 'user', uuid: prompt, parentUuid: null, message: { role: 'user', content: 'ALPHA' } },
    assistant(thought, prompt, 'msg_first', 0, { type: 'thinking', thinking: 'pondering' }),
    assistant(answer, thought, 'msg_first', 1, { type: 'text', text: 'BRAVO' }),
    {
      type: 'user',
      uuid: nextPrompt,
      parentUuid: answer,
      message: { role: 'user', content: 'CHARLIE' }
    },
    assistant(nextAnswer, nextPrompt, 'msg_second', 0, { type: 'text', text: 'DELTA' })
  ]
    .map((entry) =>
      JSON.stringify({
        ...entry,
        sessionId: source,
        timestamp: '2026-10-26T00:00:00.000Z',
        isSidechain: false
      })
    )
    .join('\n')
  original = `${entries}\n`
  await writeFile(path, original)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function forkThrough(uuid: string) {
  return resolveClaudeMessageFork({
    message: { sessionId: source, uuid },
    claudeConfigDirs: [join(root, 'other-account'), home]
  })
}

async function forkedTranscript(sessionId: string | null): Promise<string> {
  expect(sessionId).toBeTruthy()
  expect(sessionId).not.toBe(source)
  return readFile(join(project, `${sessionId}.jsonl`), 'utf8')
}

describe('forking a Claude chat at an agent message', () => {
  it('cuts a streamed row at the transcript entry of its API block, leaving the source as it was', async () => {
    const contents = await forkedTranscript(await forkThrough(claudeSourceBlockId('msg_first', 1)))
    expect(contents).toContain('ALPHA')
    expect(contents).toContain('BRAVO')
    expect(contents).not.toContain('CHARLIE')
    expect(contents).not.toContain('DELTA')
    expect(contents).toContain(`"messageUuid":"${answer}"`)
    expect(await readFile(path, 'utf8')).toBe(original)
    expect(await readdir(project)).toHaveLength(2)
  })

  it('cuts a row keyed by its own transcript uuid there', async () => {
    const contents = await forkedTranscript(await forkThrough(answer))
    expect(contents).toContain('BRAVO')
    expect(contents).not.toContain('CHARLIE')
  })

  it('does not fork at a message the transcript has not saved yet', async () => {
    expect(await forkThrough(claudeSourceBlockId('msg_streaming', 0))).toBeNull()
    expect(await readdir(project)).toEqual([`${source}.jsonl`])
  })
})
