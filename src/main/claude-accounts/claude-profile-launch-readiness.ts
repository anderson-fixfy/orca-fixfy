import { existsSync } from 'node:fs'
import { claudeProfileSetupFailed } from './claude-profile-launch-errors'
import { claudeProfileMarkerPath, type ClaudeProfileDescriptor } from './claude-profile-paths'
import type { ClaudeProfileSetupReport } from './claude-profile-setup'

/** Initial setup must succeed; a later refresh may time out without blocking the launch. */
export async function readyClaudeProfileForLaunch(
  profile: ClaudeProfileDescriptor,
  setUp: (profile: ClaudeProfileDescriptor) => Promise<ClaudeProfileSetupReport>,
  refreshWaitMs: number
): Promise<void> {
  // A missing marker means initial setup has not completed.
  if (!existsSync(claudeProfileMarkerPath(profile))) {
    const report = await setUp(profile).catch(() => null)
    if (report?.outcome !== 'prepared') {
      throw claudeProfileSetupFailed()
    }
    return
  }
  // Run with the previous setup if refreshing fails or exceeds the deadline.
  const refresh = setUp(profile).catch((error: unknown) => {
    console.warn('[claude-profile] Account refresh failed:', error)
  })
  await Promise.race([
    refresh,
    new Promise((resolve) => setTimeout(resolve, refreshWaitMs).unref())
  ])
}
