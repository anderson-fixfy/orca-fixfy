import { ipcRenderer } from 'electron'
import type { FixfyPanelResult } from '../../shared/fixfy-panel-types'

export type FixfyPanelApi = {
  get: (sessionId: string) => Promise<FixfyPanelResult>
}

export const fixfyPanelApi = {
  get: (sessionId: string): Promise<FixfyPanelResult> =>
    ipcRenderer.invoke('fixfy:panel', sessionId)
} satisfies FixfyPanelApi
