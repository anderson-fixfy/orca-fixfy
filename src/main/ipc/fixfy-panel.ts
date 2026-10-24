import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ipcMain } from 'electron'
import type { FixfyPanelData, FixfyPanelResult } from '../../shared/fixfy-panel-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'

const MEASUREMENTS = path.join('.measurements', 'measurements.jsonl')
const DEFAULT_TTL_MIN = 60

/** The workspace root: `FIXFY_WORKSPACE`, else the nearest ancestor of the chat's directory that holds the measurements. */
export async function findFixfyWorkspace(
  launchDirectory: string | null,
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => Promise<boolean> = fileExists
): Promise<string | null> {
  if (env.FIXFY_WORKSPACE && (await exists(path.join(env.FIXFY_WORKSPACE, MEASUREMENTS)))) {
    return env.FIXFY_WORKSPACE
  }
  let dir = launchDirectory ? path.resolve(launchDirectory) : null
  while (dir) {
    if (await exists(path.join(dir, MEASUREMENTS))) {
      return dir
    }
    const parent = path.dirname(dir)
    dir = parent === dir ? null : parent
  }
  return null
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** `promptCacheTtl` is `"1h"` or `"5m"` in the workspace settings. */
export function parseFixfyCacheTtl(settingsText: string | null): number {
  try {
    const ttl = settingsText ? JSON.parse(settingsText)?.promptCacheTtl : undefined
    const match = typeof ttl === 'string' ? /^(\d+)([mh])$/.exec(ttl) : null
    if (match) {
      return Number(match[1]) * (match[2] === 'h' ? 60 : 1)
    }
  } catch {
    // Unreadable settings fall back to the default.
  }
  return DEFAULT_TTL_MIN
}

/** Sums the `turn` and `subagent` lines of the given Claude sessions. */
export function summarizeFixfyMeasurements(
  text: string,
  base: Pick<FixfyPanelData, 'ids' | 'launchDirectory' | 'ttlMin'>
): FixfyPanelData {
  const out: FixfyPanelData = {
    ...base,
    cost: 0,
    turnCost: 0,
    subagentCost: 0,
    turns: 0,
    subagents: 0,
    lastTurnAt: null,
    lastContext: null
  }
  const needles = base.ids.map((id) => `"${id}"`)
  for (const line of text.split('\n')) {
    if (!needles.some((needle) => line.includes(needle))) {
      continue
    }
    let row: Record<string, unknown>
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof row.session_id !== 'string' || !base.ids.includes(row.session_id)) {
      continue
    }
    const usd = Number(row.estimated_cost_usd) || 0
    if (row.event === 'turn') {
      out.turns += 1
      out.turnCost += usd
      const at = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : Number.NaN
      if (!Number.isNaN(at) && (out.lastTurnAt === null || at >= out.lastTurnAt)) {
        out.lastTurnAt = at
        out.lastContext = Number(row.max_context) || out.lastContext
      }
    } else if (row.event === 'subagent') {
      out.subagents += 1
      out.subagentCost += usd
    }
  }
  out.cost = out.turnCost + out.subagentCost
  return out
}

export async function readFixfyPanelData(sessionId: unknown): Promise<FixfyPanelResult> {
  if (typeof sessionId !== 'string') {
    return { error: 'sessão inválida' }
  }
  const record = getStructuredAgentSessionHost()?.deps.store.getRecord(sessionId)
  if (!record) {
    return { error: `sessão ${sessionId} fora do diário do Orca` }
  }
  if (record.location.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return { error: 'sessão remota, sem a medição local' }
  }
  const ids = [...new Set(record.providerHandleChain.map((link) => link.handle.nativeId))]
  const launchDirectory = record.launchDirectory ?? null
  const workspace = await findFixfyWorkspace(launchDirectory)
  if (!workspace) {
    return { error: `sem ${MEASUREMENTS} acima de ${launchDirectory ?? 'o chat'}` }
  }
  const settings = await readFile(path.join(workspace, '.claude', 'settings.json'), 'utf8').catch(
    () => null
  )
  const text = await readFile(path.join(workspace, MEASUREMENTS), 'utf8')
  return summarizeFixfyMeasurements(text, {
    ids,
    launchDirectory,
    ttlMin: parseFixfyCacheTtl(settings)
  })
}

export function registerFixfyPanelHandlers(): void {
  ipcMain.handle('fixfy:panel', (_event, sessionId: unknown) =>
    readFixfyPanelData(sessionId).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error)
    }))
  )
}
