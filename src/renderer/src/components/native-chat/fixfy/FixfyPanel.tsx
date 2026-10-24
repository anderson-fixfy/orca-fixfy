import { useEffect, useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { NativeChatMessage } from '../../../../../shared/native-chat-types'
import type { FixfyPanelResult } from '../../../../../shared/fixfy-panel-types'
import { fixfyPanelGroups, fixfyPanelHeader, summarizeFixfyPanel } from './fixfy-panel-summary'

const OPEN_KEY = 'fixfy-panel-open'
const POLL_MS = 30_000

type OpenState = Record<string, boolean>

function readOpenState(): OpenState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {}
  } catch {
    return {}
  }
}

/** Shared by every chat, like the agents strip's collapsed state. */
function useOpenState(): [OpenState, (key: string, open: boolean) => void] {
  const [open, setOpen] = useState(readOpenState)
  const set = (key: string, value: boolean): void => {
    const next = { ...open, [key]: value }
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      // Unsaved state only resets on the next mount.
    }
  }
  return [open, set]
}

function useFixfyPanelData(
  sessionId: string,
  isWorking: boolean,
  isVisible: boolean
): { data: FixfyPanelResult | null; now: number } {
  const [data, setData] = useState<FixfyPanelResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isVisible) {
      return
    }
    let alive = true
    const load = (): void => {
      setNow(Date.now())
      const api = window.api?.fixfyPanel
      if (!api) {
        setData({ error: 'canal fixfy:panel ausente' })
        return
      }
      api.get(sessionId).then(
        (next) => alive && setData(next),
        (error: unknown) => alive && setData({ error: String(error) })
      )
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId, isWorking, isVisible])
  return { data, now }
}

/** Fixfy strip above the composer, drawn like `NativeChatBackgroundTasksStatus`. */
export function FixfyPanel(props: {
  sessionId: string
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  isVisible: boolean
}): React.JSX.Element | null {
  const listId = useId()
  const summary = useMemo(() => summarizeFixfyPanel(props.messages), [props.messages])
  const { data, now } = useFixfyPanelData(props.sessionId, props.isWorking, props.isVisible)
  const [open, setOpen] = useOpenState()
  const root = data && 'launchDirectory' in data ? data.launchDirectory : null
  const groups = useMemo(() => fixfyPanelGroups(summary, root), [summary, root])
  const header = fixfyPanelHeader(summary, data, { now, isWorking: props.isWorking })
  if (header.segments.length === 0 && !header.detail) {
    return null
  }
  // Collapsed by default, as the agents strip.
  const expanded = open.__panel === true
  const label = `Painel da Fixfy: ${[...header.segments, header.detail].filter(Boolean).join(', ')}`
  return (
    <div data-fixfy-panel="" className="shrink-0 bg-chat-canvas px-3 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-(--chat-content-max-width)">
        <div className="overflow-hidden rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground shadow-xs">
          <div className="flex h-8 items-center px-1.5">
            <button
              type="button"
              className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-label={label}
              title={expanded ? 'Minimizar o painel' : 'Expandir o painel'}
              onClick={() => setOpen('__panel', !expanded)}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">Fixfy</span>
                {header.segments.map((segment) => (
                  <span key={segment}>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-medium text-foreground">{segment}</span>
                  </span>
                ))}
                {header.detail ? <span> — {header.detail}</span> : null}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`ml-auto size-3 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
          {expanded && groups.length > 0 ? (
            <div
              id={listId}
              className="scrollbar-sleek max-h-40 overflow-y-auto border-t border-border px-3 py-2"
            >
              {groups.map((group, index) => {
                // Groups open by default: only `false` closes one.
                const groupOpen = open[group.key] !== false
                return (
                  <div
                    key={group.key}
                    className={index > 0 ? 'mt-1.5 border-t border-border/60 pt-1.5' : ''}
                  >
                    <button
                      type="button"
                      aria-expanded={groupOpen}
                      title={groupOpen ? `Minimizar ${group.title}` : `Expandir ${group.title}`}
                      onClick={() => setOpen(group.key, !groupOpen)}
                      className="flex w-full cursor-pointer items-center gap-1 rounded-sm px-0.5 pb-1 text-left font-mono text-3xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <span>
                        {group.title} · {group.count}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`ml-auto size-3 shrink-0 transition-transform motion-reduce:transition-none ${groupOpen ? '' : '-rotate-90'}`}
                      />
                    </button>
                    {groupOpen ? (
                      <ul role="list" aria-label={group.title} className="space-y-0.5">
                        {group.items.map((item, itemIndex) => (
                          <li
                            key={itemIndex}
                            className="flex h-6 min-w-0 items-center gap-2 text-foreground"
                            title={item.title ?? item.label}
                          >
                            <span
                              className={`min-w-0 flex-1 truncate ${item.mono ? 'font-mono text-3xs' : ''}`}
                            >
                              {item.label}
                            </span>
                            {item.meta ? (
                              <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
                                {item.meta}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
