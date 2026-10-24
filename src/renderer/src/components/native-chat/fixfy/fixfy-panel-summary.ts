import type { NativeChatMessage } from '../../../../../shared/native-chat-types'
import type { FixfyPanelResult } from '../../../../../shared/fixfy-panel-types'

type FixfyToolCall = {
  name: string
  input: Record<string, unknown>
  output: string
  failed: boolean
}

export type FixfyPanelSummary = {
  skills: Map<string, number>
  files: Map<string, number>
  mcp: Map<string, number>
  git: { commits: number; pushes: number; prs: string[]; log: string[] }
}

export type FixfyPanelItem = { label: string; meta: string; title?: string; mono?: boolean }

export type FixfyPanelGroup = { key: string; title: string; count: number; items: FixfyPanelItem[] }

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toolCalls(messages: readonly NativeChatMessage[]): FixfyToolCall[] {
  const results = new Map<string, { output: string; isError?: boolean }>()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool-result' && block.callId !== undefined) {
        results.set(block.callId, block)
      }
    }
  }
  const calls: FixfyToolCall[] = []
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== 'tool-call') {
        continue
      }
      const result = block.callId === undefined ? undefined : results.get(block.callId)
      calls.push({
        name: block.name,
        input: isRecord(block.input) ? block.input : {},
        output: result?.output ?? '',
        failed: block.state === 'failed' || result?.isError === true
      })
    }
  }
  return calls
}

/** `mcp__plugin_figma_figma__x` reads as Figma; Atlassian splits into Jira and Confluence. */
export function fixfyMcpLabel(name: string): string {
  const parts = name.split('__')
  let server = parts[1] || '?'
  const tool = parts.slice(2).join('__')
  const plugin = /^plugin_([^_]+)_/.exec(server)
  if (plugin) {
    server = plugin[1]
  }
  if (server === 'atlassian') {
    if (/jira/i.test(tool)) {
      return 'Jira'
    }
    return /confluence/i.test(tool) ? 'Confluence' : 'Atlassian'
  }
  return server.charAt(0).toUpperCase() + server.slice(1)
}

export function summarizeFixfyPanel(messages: readonly NativeChatMessage[]): FixfyPanelSummary {
  const summary: FixfyPanelSummary = {
    skills: new Map(),
    files: new Map(),
    mcp: new Map(),
    git: { commits: 0, pushes: 0, prs: [], log: [] }
  }
  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  for (const call of toolCalls(messages)) {
    if (call.failed) {
      continue
    }
    if (call.name === 'Skill') {
      bump(summary.skills, String(call.input.skill ?? call.input.name ?? '?'))
    } else if (EDIT_TOOLS.has(call.name)) {
      const file = call.input.file_path ?? call.input.notebook_path
      if (typeof file === 'string' && file) {
        bump(summary.files, file)
      }
    } else if (call.name.startsWith('mcp__')) {
      bump(summary.mcp, fixfyMcpLabel(call.name))
    } else if (call.name === 'Bash') {
      const command = String(call.input.command ?? '')
      const commits = (command.match(/\bgit\b[^|;&\n]*?\bcommit\b/g) ?? []).length
      const pushes = (command.match(/\bgit\b[^|;&\n]*?\bpush\b/g) ?? []).length
      const prCreate = /\bgh\s+pr\s+create\b/.test(command)
      summary.git.commits += commits
      summary.git.pushes += pushes
      if (prCreate) {
        const url = /https:\/\/github\.com\/\S+\/pull\/\d+/.exec(call.output)
        summary.git.prs.push(url ? url[0] : 'PR aberto')
      }
      if (commits || pushes || prCreate) {
        summary.git.log.push(command.split('\n')[0].slice(0, 160))
      }
    }
  }
  return summary
}

export function fixfyMoney(value: number): string {
  return `US$ ${(Math.round(value * 100) / 100).toFixed(2).replace('.', ',')}`
}

export function fixfyTokens(count: number): string {
  if (!count) {
    return '0'
  }
  return count >= 1e6
    ? `${(count / 1e6).toFixed(1).replace('.', ',')} mi`
    : `${Math.round(count / 1e3)} mil`
}

function relativeTo(file: string, root: string | null): string {
  return root && file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function byCount(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

export function fixfyPanelGroups(
  summary: FixfyPanelSummary,
  root: string | null
): FixfyPanelGroup[] {
  const groups: FixfyPanelGroup[] = []
  const repeat = (count: number): string => (count > 1 ? `×${count}` : '')
  if (summary.skills.size) {
    const list = byCount(summary.skills)
    groups.push({
      key: 'skills',
      title: 'Skills',
      count: list.length,
      items: list.map(([skill, count]) => ({ label: skill, meta: repeat(count) }))
    })
  }
  if (summary.files.size) {
    const list = byCount(summary.files)
    groups.push({
      key: 'files',
      title: 'Arquivos',
      count: list.length,
      items: list.map(([file, count]) => ({
        label: relativeTo(file, root),
        meta: repeat(count),
        title: file
      }))
    })
  }
  const git = summary.git
  if (git.commits || git.pushes || git.prs.length) {
    const items: FixfyPanelItem[] = git.prs.map((pr) => {
      const number = /\/pull\/(\d+)/.exec(pr)
      return { label: number ? `PR #${number[1]}` : pr, meta: '', title: pr }
    })
    for (const command of git.log) {
      items.push({ label: command, meta: '', title: command, mono: true })
    }
    groups.push({
      key: 'git',
      title: 'Git',
      count: git.commits + git.pushes + git.prs.length,
      items
    })
  }
  if (summary.mcp.size) {
    const list = byCount(summary.mcp)
    groups.push({
      key: 'mcp',
      title: 'MCP',
      count: list.reduce((total, [, count]) => total + count, 0),
      items: list.map(([server, count]) => ({ label: server, meta: String(count) }))
    })
  }
  return groups
}

/** One header line: highlighted segments, then the cache state after a dash. */
export function fixfyPanelHeader(
  summary: FixfyPanelSummary,
  data: FixfyPanelResult | null,
  state: { now: number; isWorking: boolean }
): { segments: string[]; detail: string | null } {
  const segments: string[] = []
  let detail: string | null = null
  if (data === null) {
    detail = 'carregando a medição…'
  } else if (!('ids' in data) || data.error) {
    detail = `medição indisponível: ${data.error}`
  } else {
    segments.push(fixfyMoney(data.cost))
    if (data.lastContext) {
      segments.push(`${fixfyTokens(data.lastContext)} de contexto`)
    }
    if (!data.turns) {
      detail = 'sem turno medido'
    } else if (state.isWorking) {
      detail = 'cache em uso'
    } else if (data.lastTurnAt !== null) {
      const left = Math.round((data.lastTurnAt + data.ttlMin * 60_000 - state.now) / 60_000)
      detail = left > 0 ? `cache vence em ${left} min` : `cache vencido há ${-left} min`
    }
    if (data.subagentCost) {
      detail = `${detail ? `${detail} · ` : ''}subagentes ${fixfyMoney(data.subagentCost)}`
    }
  }
  const git = summary.git
  if (summary.skills.size) {
    segments.push(plural(summary.skills.size, 'skill', 'skills'))
  }
  if (summary.files.size) {
    segments.push(plural(summary.files.size, 'arquivo', 'arquivos'))
  }
  if (git.commits) {
    segments.push(plural(git.commits, 'commit', 'commits'))
  }
  if (git.pushes) {
    segments.push(plural(git.pushes, 'push', 'pushes'))
  }
  if (git.prs.length) {
    segments.push(plural(git.prs.length, 'PR', 'PRs'))
  }
  if (summary.mcp.size) {
    const calls = [...summary.mcp.values()].reduce((total, count) => total + count, 0)
    segments.push(plural(calls, 'chamada MCP', 'chamadas MCP'))
  }
  return { segments, detail }
}
