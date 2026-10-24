import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function createLocalBuildVersion(baseVersion, timestamp, commit) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) {
    throw new Error(`Package version is not valid semver: ${baseVersion}`)
  }
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Local build timestamp is invalid.')
  }
  const sanitizedCommit = commit.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12)
  if (!sanitizedCommit) {
    throw new Error('Git commit identity is empty.')
  }
  const suffix = `local.${timestamp}.${sanitizedCommit}`
  return baseVersion.includes('-') ? `${baseVersion}.${suffix}` : `${baseVersion}-${suffix}`
}

export function getLocalBuildIdentity() {
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
  return {
    commit,
    version: createLocalBuildVersion(packageJson.version, Date.now(), commit)
  }
}

// Why the whole chain lives here: mobile/ is its own pnpm project the root install leaves empty,
// and the helper builds must see the same signing identity electron-builder uses.
export function createMacLocalBuildSteps(arch) {
  if (arch !== 'arm64' && arch !== 'x64') {
    throw new Error(`Unsupported macOS build architecture: ${arch}`)
  }
  return [
    ['pnpm', ['--dir', 'mobile', 'install', '--frozen-lockfile']],
    ['pnpm', ['run', 'build:desktop']],
    ['pnpm', ['run', 'build:computer-macos']],
    ['pnpm', ['run', 'build:keyboard-layout-macos']],
    ['pnpm', ['run', 'build:notification-status-macos']],
    ['pnpm', ['run', 'ensure:electron-runtime']],
    // Why the host slice only: the other slice's native variants are not installed locally.
    [
      'pnpm',
      [
        'exec',
        'electron-builder',
        '--config',
        'config/electron-builder.config.cjs',
        '--mac',
        'dir',
        `--${arch}`
      ]
    ]
  ]
}

export function createMacLocalBuildEnv(env, identity) {
  return {
    ...env,
    ORCA_BUILD_COMMIT: identity.commit,
    ORCA_LOCAL_BUILD_VERSION: identity.version,
    // Why: without it the helper build discovers a Keychain identity and stalls on its prompt.
    ORCA_COMPUTER_MACOS_SIGN_IDENTITY:
      env.ORCA_COMPUTER_MACOS_SIGN_IDENTITY ?? (env.CSC_NAME || '-')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const identity = getLocalBuildIdentity()
  const env = createMacLocalBuildEnv(process.env, identity)
  console.log(`[build:mac] local version ${identity.version}`)
  console.log(`[build:mac] signing identity ${env.CSC_NAME || '- (ad hoc)'}`)
  for (const [command, args] of createMacLocalBuildSteps(process.arch)) {
    execFileSync(command, args, { env, stdio: 'inherit' })
  }
}
