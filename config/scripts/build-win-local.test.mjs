import { describe, expect, it, vi } from 'vitest'
import { isUpdaterEnabled } from '../../src/main/updater/updater-enabled'
import { createLocalBuildVersion } from './build-mac-local.mjs'
import { createWinLocalBuildEnv, createWinLocalBuildSteps } from './build-win-local.mjs'

const electronApp = vi.hoisted(() => ({ isPackaged: true, getVersion: () => '' }))
vi.mock('electron', () => ({ app: electronApp }))

describe('createWinLocalBuildSteps', () => {
  const steps = createWinLocalBuildSteps()
  const indexOf = (arg) => steps.findIndex(([, args]) => args.includes(arg))

  it('installs mobile dependencies, builds, and packages only the x64 installer', () => {
    expect(steps[0]).toEqual(['pnpm', ['--dir', 'mobile', 'install', '--frozen-lockfile']])
    expect(indexOf('build:desktop')).toBeGreaterThan(0)
    expect(indexOf('ensure:electron-runtime')).toBeGreaterThan(indexOf('build:desktop'))
    expect(steps.at(-1)?.[1]).toEqual(
      expect.arrayContaining(['electron-builder', '--win', '--x64'])
    )
    expect(steps.at(-1)?.[1]).not.toContain('--arm64')
  })

  it('builds the native executables packaging verifies, for x64, before electron-builder', () => {
    for (const script of [
      'config/scripts/build-windows-cli-launcher.mjs',
      'config/scripts/build-windows-agent-hook.mjs'
    ]) {
      const step = steps[indexOf(script)]
      expect(step).toEqual(['node', [script, '--arch', 'x64']])
      expect(indexOf(script)).toBeLessThan(steps.length - 1)
    }
  })
})

describe('createWinLocalBuildEnv', () => {
  it('stamps a version the installed app reads as a local build, with the updater off', () => {
    const identity = {
      commit: 'abc123',
      version: createLocalBuildVersion('1.4.239', 1792864828830, 'abc123')
    }
    const env = createWinLocalBuildEnv({ PATH: 'x' }, identity)
    expect(env).toMatchObject({ PATH: 'x', ORCA_BUILD_COMMIT: 'abc123' })
    electronApp.getVersion = () => env.ORCA_LOCAL_BUILD_VERSION
    expect(isUpdaterEnabled()).toBe(false)
  })
})
