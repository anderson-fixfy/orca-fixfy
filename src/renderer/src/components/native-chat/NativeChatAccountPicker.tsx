import { ChevronDown, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { NativeChatAccountSwitchView } from './use-native-chat-account-switch'

/** Radix radio values are strings; System default is the one account without an id. */
const SYSTEM_DEFAULT_VALUE = ''

/** The chat's account beside its model, as `claude` and `adm` are in a terminal; a pick moves the
 *  conversation there, in this tab. */
export function NativeChatAccountPicker({
  view,
  isWorking
}: {
  view: NativeChatAccountSwitchView
  isWorking: boolean
}): React.JSX.Element {
  const title = translate('components.native-chat.composer.account', 'Account')
  const disabledReason = view.switching
    ? translate('components.native-chat.composer.accountSwitching', 'Switching account…')
    : isWorking
      ? translate(
          'components.native-chat.composer.accountWaitForTurn',
          'Switch accounts after the current turn finishes.'
        )
      : null
  return (
    <DropdownMenu onOpenChange={(open) => open && view.refresh()}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events, so the wrapper carries the hover. */}
          <span className="inline-flex min-w-0">
            <DropdownMenuTrigger asChild disabled={disabledReason !== null}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={translate(
                  'components.native-chat.composer.pillAccessibleName',
                  '{{value0}} {{value1}}',
                  { value0: title, value1: view.current.label }
                )}
                className="max-w-48 min-w-0 shrink"
              >
                <UserRound className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{view.current.label}</span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {disabledReason ?? title}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" side="top" collisionPadding={8} className="w-72">
        <DropdownMenuRadioGroup aria-label={title} value={view.current.id ?? SYSTEM_DEFAULT_VALUE}>
          {view.choices.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.id ?? SYSTEM_DEFAULT_VALUE}
              value={choice.id ?? SYSTEM_DEFAULT_VALUE}
              disabled={choice.disabled}
              onSelect={() => {
                if (choice.id !== view.current.id) {
                  void view.switchTo(choice.id)
                }
              }}
            >
              <div className="min-w-0 py-0.5">
                <div className="truncate">{choice.label}</div>
                {choice.detail ? (
                  <div className="truncate text-xs font-normal text-muted-foreground">
                    {choice.detail}
                  </div>
                ) : null}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
