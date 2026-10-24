import { useAppStore } from '@/store'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'

const RUNNABLE_SHELL_LANGUAGES = new Set(['sh', 'bash', 'zsh', 'shell', 'console'])

export function isRunnableShellLanguage(language: string | undefined): boolean {
  return language !== undefined && RUNNABLE_SHELL_LANGUAGES.has(language.trim().toLowerCase())
}

/** A `console` fence mixes prompts with their output; only its `$ ` lines are commands. */
export function shellCommandFromCodeBlock(code: string, language: string): string {
  if (language.trim().toLowerCase() === 'console') {
    const prompted = code
      .split(/\r?\n/)
      .filter((line) => line.startsWith('$ '))
      .map((line) => line.slice(2))
    if (prompted.length > 0) {
      return prompted.join('\n')
    }
  }
  return code.trimEnd()
}

/**
 * Opens a terminal tab beside the chat and runs the block as its startup command, like a Quick
 * Command run. Not flattened as Quick Commands are: joining lines with `; ` would let a comment
 * swallow the rest, and the startup write bracket-pastes multiline text into the shell.
 */
export function runCodeInNewTerminalTab({
  command,
  worktreeId,
  sourceTabId,
  cwd
}: {
  command: string
  worktreeId: string
  sourceTabId?: string
  cwd?: string
}): { tabId: string } | null {
  if (!command.trim()) {
    return null
  }
  const store = useAppStore.getState()
  const groupId = store.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) => tab.id === sourceTabId || tab.entityId === sourceTabId
  )?.groupId
  const tab = store.createTab(worktreeId, groupId, undefined, {
    pendingStartup: { command },
    ...(cwd ? { startupCwd: cwd } : {})
  })
  store.setActiveTabType('terminal', worktreeId)
  persistAgentLaunchTabOrder(worktreeId, tab.id)
  return { tabId: tab.id }
}
