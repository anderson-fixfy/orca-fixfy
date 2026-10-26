import { useId } from 'react'
import { AlarmClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { formatUsageLimitResetClock } from '../../../../shared/agent-session-usage-limit'
import type { NativeChatUsageLimitAutoResumeView } from './use-native-chat-usage-limit-auto-resume'

/** Beside Continue on a usage limit's row: schedule it for the reset, or the schedule and Cancel. */
export function NativeChatUsageLimitAutoResume({
  autoResume
}: {
  autoResume: NativeChatUsageLimitAutoResumeView
}): React.JSX.Element {
  const explanationId = useId()
  if (autoResume.resumeAt !== null) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span>
          {translate(
            'components.native-chat.usageLimitAutoResume.scheduled',
            'Resumes at {{time}}',
            { time: formatUsageLimitResetClock(autoResume.resumeAt) }
          )}
        </span>
        <span aria-hidden="true">·</span>
        <Button
          type="button"
          variant="link"
          size="xs"
          disabled={autoResume.busy}
          onClick={autoResume.cancel}
        >
          {translate('components.native-chat.usageLimitAutoResume.cancel', 'Cancel')}
        </Button>
      </span>
    )
  }
  const explanation = translate(
    'components.native-chat.usageLimitAutoResume.explanation',
    'Sends Continue in this chat at {{time}}, a minute after the limit resets, even with this window closed.',
    { time: formatUsageLimitResetClock(autoResume.plannedAt) }
  )
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-describedby={explanationId}
            disabled={autoResume.busy}
            onClick={autoResume.schedule}
          >
            <AlarmClock />
            {translate(
              'components.native-chat.usageLimitAutoResume.resume',
              'Resume automatically'
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {explanation}
        </TooltipContent>
      </Tooltip>
      <span id={explanationId} className="sr-only">
        {explanation}
      </span>
    </>
  )
}
