import { useContext, useState } from 'react'
import { GitFork } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NativeChatForkContext } from './native-chat-fork-from-message'

/** Forks the chat at this agent message into a new chat tab; absent where the chat cannot fork. */
export function NativeChatForkButton({
  messageId,
  className
}: {
  messageId: string
  className: string
}): React.JSX.Element | null {
  const fork = useContext(NativeChatForkContext)
  // One fork per click: the host copies the transcript before the new tab opens.
  const [forking, setForking] = useState(false)
  if (!fork) {
    return null
  }
  const label = translate('components.native-chat.forkFromMessage', 'Fork from this message')
  return (
    <button
      type="button"
      disabled={forking}
      aria-busy={forking}
      onClick={() => {
        setForking(true)
        void fork(messageId).finally(() => setForking(false))
      }}
      aria-label={label}
      title={label}
      className={cn(className, 'disabled:opacity-50')}
    >
      <GitFork className="size-3.5" />
    </button>
  )
}
