import { app } from 'electron'

// The suffix config/scripts/build-mac-local.mjs stamps on a local build's version.
const LOCAL_BUILD_VERSION_SUFFIX = /[-.]local\.\d+\.[0-9A-Za-z-]+$/

/** Why: a local build is rebuilt from source; an update check would install the upstream release over it. */
export function isUpdaterEnabled(): boolean {
  return app.isPackaged && !LOCAL_BUILD_VERSION_SUFFIX.test(app.getVersion())
}
