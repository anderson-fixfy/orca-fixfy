/** What the Fixfy panel reads from the workspace measurements for one Orca chat. */
export type FixfyPanelData = {
  /** Claude session ids of the chat, from the record's provider handle chain. */
  ids: string[]
  launchDirectory: string | null
  /** Main-session prompt cache TTL, from the workspace `promptCacheTtl`. */
  ttlMin: number
  cost: number
  turnCost: number
  subagentCost: number
  turns: number
  subagents: number
  lastTurnAt: number | null
  lastContext: number | null
  error?: string
}

export type FixfyPanelResult = FixfyPanelData | { error: string }
