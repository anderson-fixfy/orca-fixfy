import { describe, expect, it } from 'vitest'
import {
  createLocalBuildVersion,
  createMacLocalBuildEnv,
  createMacLocalBuildSteps
} from './build-mac-local.mjs'

describe('createLocalBuildVersion', () => {
  it('creates unique valid prerelease versions without changing the release base', () => {
    expect(createLocalBuildVersion('1.4.159-rc.0', 123456, 'abc123')).toBe(
      '1.4.159-rc.0.local.123456.abc123'
    )
    expect(createLocalBuildVersion('1.4.159', 123456, 'abc123')).toBe('1.4.159-local.123456.abc123')
  })

  it('sanitizes commit identifiers', () => {
    expect(createLocalBuildVersion('1.0.0', 1, 'abc/def')).toBe('1.0.0-local.1.abcdef')
  })
})

describe('createMacLocalBuildSteps', () => {
  it('installs mobile dependencies before the desktop build and packages only the host slice', () => {
    const steps = createMacLocalBuildSteps('arm64')
    expect(steps[0]).toEqual(['pnpm', ['--dir', 'mobile', 'install', '--frozen-lockfile']])
    expect(steps.findIndex(([, args]) => args.includes('build:desktop'))).toBeGreaterThan(0)
    expect(steps.at(-1)?.[1]).toEqual(expect.arrayContaining(['--mac', 'dir', '--arm64']))
    expect(steps.at(-1)?.[1]).not.toContain('--x64')
  })

  it('rejects an architecture electron-builder cannot package for macOS', () => {
    expect(() => createMacLocalBuildSteps('ia32')).toThrow('Unsupported macOS build architecture')
  })
})

describe('createMacLocalBuildEnv', () => {
  const identity = { commit: 'abc123', version: '1.0.0-local.1.abc123' }

  it('signs helpers ad hoc when no identity is named, so no Keychain identity is discovered', () => {
    expect(createMacLocalBuildEnv({}, identity).ORCA_COMPUTER_MACOS_SIGN_IDENTITY).toBe('-')
  })

  it('signs helpers with the named identity', () => {
    const env = createMacLocalBuildEnv({ CSC_NAME: 'Apple Development: dev@example.com' }, identity)
    expect(env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY).toBe('Apple Development: dev@example.com')
    expect(env.ORCA_LOCAL_BUILD_VERSION).toBe(identity.version)
  })
})
