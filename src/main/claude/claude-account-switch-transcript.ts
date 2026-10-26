import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'

function claudeTranscriptIn(home: string, providerSessionId: string): Promise<string | null> {
  return resolveSessionFilePath('claude', providerSessionId, {
    claudeProjectsDir: join(home, 'projects'),
    strictErrors: true
  })
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() === true
}

/** Carry a chat's transcripts into the account it switches to, under the same project folder, so
 *  `--resume` finds them there. Homes that share `projects/` already hold them. */
export async function copyClaudeTranscriptsToAccount(input: {
  providerSessionIds: readonly string[]
  /** Searched in order; the chat's own home first. */
  sourceHomes: readonly string[]
  targetHome: string
}): Promise<void> {
  const sourceHomes = [...new Set(input.sourceHomes)].filter((home) => home !== input.targetHome)
  for (const providerSessionId of new Set(input.providerSessionIds)) {
    if (await claudeTranscriptIn(input.targetHome, providerSessionId)) {
      continue
    }
    for (const home of sourceHomes) {
      const source = await claudeTranscriptIn(home, providerSessionId)
      if (!source) {
        continue
      }
      const within = relative(join(home, 'projects'), source)
      if (within.startsWith('..') || isAbsolute(within)) {
        throw new Error('claude transcript is outside its projects folder')
      }
      const destination = join(input.targetHome, 'projects', within)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      const temporary = durableWriteTempPath(destination)
      try {
        await writeTempFileDurable(temporary, await readFile(source), 0o600)
        await renameDurable(temporary, destination)
      } finally {
        await rm(temporary, { force: true })
      }
      // Subagent transcripts and stored tool results live beside it, under the session's id.
      const sessionFolder = join(dirname(source), providerSessionId)
      if (await isDirectory(sessionFolder)) {
        await cp(sessionFolder, join(dirname(destination), providerSessionId), {
          recursive: true,
          force: false
        })
      }
      break
    }
  }
}
