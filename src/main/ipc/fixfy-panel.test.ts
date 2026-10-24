import { describe, expect, it } from 'vitest'
import { findFixfyWorkspace, parseFixfyCacheTtl, summarizeFixfyMeasurements } from './fixfy-panel'

const base = { ids: ['claude-a', 'claude-b'], launchDirectory: '/ws/repo', ttlMin: 60 }

describe('summarizeFixfyMeasurements', () => {
  it('sums turns and subagents of the chat sessions only, keeping the latest turn context', () => {
    const text = [
      '{"event":"turn","session_id":"claude-a","estimated_cost_usd":1.5,"timestamp":"2026-10-24T10:00:00Z","max_context":1000}',
      '{"event":"turn","session_id":"claude-b","estimated_cost_usd":0.5,"timestamp":"2026-10-24T11:00:00Z","max_context":2000}',
      '{"event":"subagent","session_id":"claude-a","estimated_cost_usd":0.25}',
      '{"event":"turn","session_id":"other","estimated_cost_usd":9}',
      '{"event":"skill","session_id":"claude-a"}',
      'not json "claude-a"'
    ].join('\n')
    expect(summarizeFixfyMeasurements(text, base)).toMatchObject({
      turns: 2,
      subagents: 1,
      turnCost: 2,
      subagentCost: 0.25,
      cost: 2.25,
      lastTurnAt: Date.parse('2026-10-24T11:00:00Z'),
      lastContext: 2000
    })
  })
})

describe('parseFixfyCacheTtl', () => {
  it('reads hours and minutes, and falls back to an hour', () => {
    expect(parseFixfyCacheTtl('{"promptCacheTtl":"1h"}')).toBe(60)
    expect(parseFixfyCacheTtl('{"promptCacheTtl":"5m"}')).toBe(5)
    expect(parseFixfyCacheTtl('{')).toBe(60)
    expect(parseFixfyCacheTtl(null)).toBe(60)
  })
})

describe('findFixfyWorkspace', () => {
  const existing = (files: string[]) => async (file: string) => files.includes(file)

  it('walks up from a submodule worktree to the workspace that holds the measurements', async () => {
    const exists = existing(['/ws/.measurements/measurements.jsonl'])
    expect(await findFixfyWorkspace('/ws/orca-fixfy/.worktrees/feat', {}, exists)).toBe('/ws')
  })

  it('prefers FIXFY_WORKSPACE and gives up without measurements', async () => {
    const exists = existing(['/env/.measurements/measurements.jsonl'])
    expect(await findFixfyWorkspace('/ws/repo', { FIXFY_WORKSPACE: '/env' }, exists)).toBe('/env')
    expect(await findFixfyWorkspace('/ws/repo', {}, exists)).toBeNull()
  })
})
