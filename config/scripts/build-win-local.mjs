import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { getLocalBuildIdentity } from './build-mac-local.mjs'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

// Why the whole chain lives here: mobile/ is its own pnpm project the root install leaves empty,
// and packaging verifies native executables that build:desktop does not compile.
export function createWinLocalBuildSteps() {
  return [
    ['pnpm', ['--dir', 'mobile', 'install', '--frozen-lockfile']],
    ['pnpm', ['run', 'build:desktop']],
    ['node', ['config/scripts/build-windows-cli-launcher.mjs', '--arch', 'x64']],
    ['node', ['config/scripts/build-windows-agent-hook.mjs', '--arch', 'x64']],
    ['pnpm', ['run', 'ensure:electron-runtime']],
    [
      'pnpm',
      [
        'exec',
        'electron-builder',
        '--config',
        'config/electron-builder.config.cjs',
        '--win',
        '--x64',
        '--publish',
        'never'
      ]
    ]
  ]
}

export function createWinLocalBuildEnv(env, identity) {
  return {
    ...env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version
  }
}

function resolveStepInvocation(command) {
  return command === 'node'
    ? { command: process.execPath, prefixArgs: [], shell: false }
    : resolvePnpmCliInvocation()
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getLocalBuildIdentity()
  const env = createWinLocalBuildEnv(process.env, identity)
  console.log(`[build:win] local version ${identity.version}`)
  for (const [step, args] of createWinLocalBuildSteps()) {
    const { command, prefixArgs, shell } = resolveStepInvocation(step)
    execFileSync(command, [...prefixArgs, ...args], { env, shell, stdio: 'inherit' })
  }
}
