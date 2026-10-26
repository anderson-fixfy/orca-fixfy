// @vitest-environment happy-dom
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatPromptEditor } from './NativeChatPromptEditor'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import { clearNativeChatComposerDraftsForTests } from './native-chat-composer-draft-store'
import { readNativeChatDraftCache } from './native-chat-draft-cache'
import { promptEditor } from './native-chat-prompt-editor.test-support'

const settings = vi.hoisted(() => ({ nativeChatMarkdownComposer: true }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settings: typeof settings }) => unknown) =>
    selector({ settings })
}))

afterEach(() => {
  cleanup()
  clearNativeChatComposerDraftsForTests()
  settings.nativeChatMarkdownComposer = true
})

function setup(value = '', scopeKey?: string) {
  const inputRef = createRef<NativeChatComposerInput>()
  const view = render(
    <NativeChatPromptEditor
      scopeKey={scopeKey}
      inputRef={inputRef}
      initialValue={value}
      disabled={false}
      placeholder="Message"
      onChange={vi.fn()}
      onSelect={vi.fn()}
    />
  )
  const textbox = within(view.container).getByRole('textbox')
  return { ...view, textbox, input: inputRef.current!, editor: promptEditor(textbox) }
}

describe('native chat composer in Markdown mode', () => {
  const image = '[Image](orca-image:img-1)'

  it('shows the draft formatted and reads back the Markdown it sends', async () => {
    const markdown = `Fix **this** in \`a.ts\`:\n\n- one ${image}\n- two`
    const { textbox, input } = setup(markdown)
    expect(textbox.querySelector('strong')?.textContent).toBe('this')
    expect(textbox.querySelector('code')?.textContent).toBe('a.ts')
    expect(textbox.querySelectorAll('li')).toHaveLength(2)
    expect(input.value).toBe(markdown)
    await waitFor(() =>
      expect(textbox.querySelector('[data-native-chat-image-reference]')).not.toBeNull()
    )
  })

  it('keeps carets in Markdown offsets, so a picked skill replaces the typed token', async () => {
    const { textbox, input } = setup('**Fix** it with $rev')
    act(() => input.setSelectionRange(20, 20))
    expect(input.selectionStart).toBe(20)
    await act(async () => input.insertSkill!(16, 20, '$review'))
    expect(input.value).toBe('**Fix** it with $review ')
    expect(textbox.querySelector('[data-native-chat-skill]')).not.toBeNull()
    expect(textbox.querySelector('strong')?.textContent).toBe('Fix')
  })

  it('makes Shift+Enter the Markdown editor Enter, since Enter sends', () => {
    const { textbox, input, editor } = setup('- one')
    act(() => input.setSelectionRange(5, 5))
    fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true })
    act(() => {
      editor.commands.insertContent('two')
    })
    expect(input.value).toBe('- one\n- two')
  })

  it('takes a value set from outside as Markdown, as Edit on a sent message sets it', () => {
    const { textbox, input } = setup('Half-written **follow-up**')
    const edited = 'Half-written **follow-up**\n\nRename the flag to `enableFoo`.'
    act(() => {
      input.value = edited
    })
    expect(input.value).toBe(edited)
    expect(textbox.querySelector('code')?.textContent).toBe('enableFoo')
    expect(textbox.querySelector('strong')?.textContent).toBe('follow-up')
    act(() => {
      input.value = `${edited} Then ship`
    })
    expect(input.value).toBe(`${edited} Then ship`)
    expect(textbox.querySelector('code')?.textContent).toBe('enableFoo')
  })

  it('reads a draft the other mode saved as the text it holds', () => {
    const { editor, unmount } = setup('', 'scope')
    act(() => {
      editor.commands.insertContent([
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and more' }
      ])
    })
    const draft = readNativeChatDraftCache('scope')
    expect(draft).toBe('**bold** and more')
    unmount()
    settings.nativeChatMarkdownComposer = false
    expect(setup(draft, 'scope').input.value).toBe(draft)
  })
})
