import type { NativeChatMessage } from '../../../../../shared/native-chat-types'
import { FixfyExpandLayer } from './FixfyExpandLayer'
import { FixfyPanel } from './FixfyPanel'

/** Everything Fixfy adds above the composer; the structured session spreads its props and controller here. */
export function FixfyNativeChatDock(props: {
  sessionId: string
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  isVisible: boolean
}): React.JSX.Element {
  const { sessionId, messages, isWorking, isVisible } = props
  return (
    <>
      <FixfyExpandLayer />
      <FixfyPanel
        sessionId={sessionId}
        messages={messages}
        isWorking={isWorking}
        isVisible={isVisible}
      />
    </>
  )
}
