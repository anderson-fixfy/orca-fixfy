import { useCallback, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { fetchProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'
import { useStructuredAgentSessionHostCapabilityState } from '@/runtime/structured-agent-session-host-capability'
import {
  getClaudeStatusActiveId,
  resolveClaudeStatusAccountState
} from '@/components/status-bar/status-bar-claude-accounts'
import { STRUCTURED_AGENT_SESSION_ACCOUNT_SWITCH_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import type { AgentSessionAccountSwitchResult } from '../../../../shared/agent-session-account-switch'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { ClaudeRateLimitAccountsState } from '../../../../shared/managed-account-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { useStructuredAgentSessionAccountSwitch } from './structured-agent-session-status-hooks'
import type { StructuredAgentSessionWrite } from './use-structured-agent-session-mutate'

/** `id` null is System default; `detail` is the login it holds, when the host knows it. */
export type NativeChatAccountChoice = {
  id: string | null
  label: string
  disabled: boolean
  detail?: string
}

/** The chat's account and the switch to another, for the composer's picker and any control that
 *  moves the chat before acting, as Continue in another account does. */
export type NativeChatAccountSwitchView = {
  current: { id: string | null; label: string }
  choices: readonly NativeChatAccountChoice[]
  /** Reads the host's accounts again; the picker calls it as it opens. */
  refresh: () => void
  switching: boolean
  /** True once the chat runs on `accountId`; false leaves it where it was, so nothing may follow. */
  switchTo: (accountId: string | null) => Promise<boolean>
}

const NO_HOST_ACCOUNTS: ClaudeRateLimitAccountsState = {
  accounts: [],
  activeAccountId: null
}
const HOST_TARGET = { runtime: 'host', wslDistro: null } as const

/** The accounts a Claude chat can move to, as the status bar's switcher lists them for this host,
 *  and the move itself. Null where the chat has no accounts to pick or its host cannot switch. */
export function useNativeChatAccountSwitch(
  session: { agent: AgentType; target: RuntimeClientTarget; sessionId: string },
  write: StructuredAgentSessionWrite,
  reportError: (notice: string) => void
): NativeChatAccountSwitchView | null {
  const { agent, target, sessionId } = session
  const capability = useStructuredAgentSessionHostCapabilityState(
    agent === 'claude' ? target : null,
    STRUCTURED_AGENT_SESSION_ACCOUNT_SWITCH_RUNTIME_CAPABILITY
  )
  const switched = useStructuredAgentSessionAccountSwitch(sessionId, target)
  const settings = useAppStore((store) => store.settings)
  const [hostAccounts, setHostAccounts] = useState<ClaudeRateLimitAccountsState | null>(null)
  const [switching, setSwitching] = useState(false)
  const inFlight = useRef(false)
  const refresh = useCallback(() => {
    void fetchProviderAccountsSnapshot(target)
      .then((snapshot) => {
        // A failed Claude half is an empty stand-in, not the host's roster.
        if (!snapshot.failedProviders?.includes('claude')) {
          setHostAccounts(snapshot.claude)
        }
      })
      .catch((error: unknown) => {
        console.warn('[native-chat-account-switch] account list failed:', error)
      })
  }, [target])
  const switchTo = useCallback(
    async (accountId: string | null): Promise<boolean> => {
      if (inFlight.current) {
        return false
      }
      inFlight.current = true
      setSwitching(true)
      try {
        const outcome = await write<AgentSessionAccountSwitchResult>(
          'agentSession.switchAccount',
          'agentSession.switchAccount',
          { accountId }
        )
        if (outcome.kind === 'not-done') {
          reportError(outcome.notice)
        }
        return outcome.kind === 'done'
      } finally {
        inFlight.current = false
        setSwitching(false)
      }
    },
    [reportError, write]
  )
  const ownerEnvironmentId = target.kind === 'environment' ? target.environmentId : null
  const state = useMemo(
    () =>
      resolveClaudeStatusAccountState(
        settings,
        hostAccounts ?? NO_HOST_ACCOUNTS,
        ownerEnvironmentId
      ),
    [hostAccounts, ownerEnvironmentId, settings]
  )
  const choices = useMemo(
    (): NativeChatAccountChoice[] => [
      {
        id: null,
        label: translate('auto.components.status.bar.StatusBar.c676918adc', 'System default'),
        disabled: false,
        ...(state.systemDefaultEmail ? { detail: state.systemDefaultEmail } : {})
      },
      ...state.accounts
        .filter((account) => account.managedAuthRuntime !== 'wsl')
        .map((account) => ({
          id: account.id,
          label: account.email,
          // Why: its launch would stop at sign-in; the status bar offers that sign-in.
          disabled: account.needsSignIn === true
        }))
    ],
    [state.accounts, state.systemDefaultEmail]
  )
  const currentId = switched ? switched.accountId : getClaudeStatusActiveId(state, HOST_TARGET)
  const currentLabel =
    choices.find((choice) => choice.id === currentId)?.label ?? switched?.account ?? ''
  // Without a saved account there is nowhere to move the chat, unless it was moved before.
  const available =
    agent === 'claude' && capability === 'supported' && (choices.length > 1 || switched !== null)
  return useMemo(
    () =>
      available
        ? {
            current: { id: currentId, label: currentLabel },
            choices,
            refresh,
            switching,
            switchTo
          }
        : null,
    [available, choices, currentId, currentLabel, refresh, switchTo, switching]
  )
}
