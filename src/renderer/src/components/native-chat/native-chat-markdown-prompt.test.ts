import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createRichMarkdownEditorCodec } from '../editor/rich-markdown-source-transport'
import {
  createNativeChatMarkdownPromptExtensions,
  markdownPromptContent,
  markdownPromptOffset,
  markdownPromptPosition,
  markdownPromptText
} from './native-chat-markdown-prompt'
import {
  NativeChatFileReference,
  NativeChatImageReference,
  NativeChatSkill
} from './native-chat-prompt-document'

const codec = createRichMarkdownEditorCodec()
const editors: Editor[] = []

function createEditor(): Editor {
  const editor = new Editor({
    element: null,
    extensions: [
      ...createNativeChatMarkdownPromptExtensions(codec),
      NativeChatSkill,
      NativeChatFileReference,
      NativeChatImageReference
    ],
    content: '',
    contentType: 'markdown'
  })
  editors.push(editor)
  return editor
}

function load(editor: Editor, markdown: string): void {
  editor.commands.setContent(markdownPromptContent(editor, codec, markdown))
}

function nodeTypes(content: JSONContent): string[] {
  return [
    content.type ?? '',
    ...(content.marks ?? []).map((mark) => mark.type),
    ...(content.content ?? []).flatMap(nodeTypes)
  ]
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe('native chat Markdown prompt', () => {
  const image = '[Image](orca-image:img-1)'
  const pasted = '[Pasted text](orca-paste:0b0c1e2a-3d4f-4a5b-8c6d-7e8f9a0b1c2d)'

  it.each([
    `**Bold**, *italic* and \`code\` next to ${image} and ${pasted}`,
    `# Plan\n\n- one ${image}\n- two\n\n1. first\n2. second`,
    '```ts\nconst a = 1 < 2 && 3 > 2\n```\n\n> quoted',
    'snake_case, a * b and 2*3 stay as typed'
  ])('reads Markdown into formatted nodes and writes the same Markdown back: %s', (markdown) => {
    const editor = createEditor()
    load(editor, markdown)
    expect(markdownPromptText(editor)).toBe(markdown)
  })

  it('reads the image and pasted-text tokens as their pills, not as links', () => {
    const editor = createEditor()
    load(editor, `**see** ${image} ${pasted}`)
    const types = nodeTypes(editor.getJSON())
    expect(types).toContain('bold')
    expect(types).toContain(NativeChatImageReference.name)
    expect(types).toContain(NativeChatFileReference.name)
    expect(types).not.toContain('link')
  })

  it('writes the skill and file pills as their tokens, and reads that Markdown back unchanged', () => {
    const editor = createEditor()
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'nativeChatSkill', attrs: { token: '/review', path: '/skills/review' } },
            { type: 'text', text: ' the ' },
            { type: 'text', text: 'new', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ' },
            {
              type: 'nativeChatFileReference',
              attrs: { token: '@src/a_b.ts', path: '/repo/src/a_b.ts' }
            },
            { type: 'text', text: ' ' },
            { type: 'nativeChatImageReference', attrs: { attachmentId: 'img-1' } }
          ]
        }
      ]
    })
    const markdown = markdownPromptText(editor)
    expect(markdown).toBe(`/review the **new** @src/a_b.ts ${image}`)
    const reopened = createEditor()
    load(reopened, markdown)
    expect(markdownPromptText(reopened)).toBe(markdown)
  })

  it('sends typed text as typed, without HTML entities', () => {
    const editor = createEditor()
    editor.commands.insertContent({ type: 'text', text: 'x < y && z > w, Tom & Jerry, &lt;' })
    expect(markdownPromptText(editor)).toBe('x < y && z > w, Tom & Jerry, &amp;lt;')
  })

  it('maps the caret between document positions and Markdown offsets', () => {
    const editor = createEditor()
    load(editor, `**bold** /rev ${image} end`)
    const { doc } = editor.state
    const markdown = markdownPromptText(editor)
    // Inside the bold run: two characters of `**` precede it.
    expect(markdownPromptOffset(editor, doc, 3)).toBe(4)
    const afterCommand = markdown.indexOf('/rev') + '/rev'.length
    const position = markdownPromptPosition(editor, doc, afterCommand)
    expect(markdownPromptOffset(editor, doc, position)).toBe(afterCommand)
    expect(markdownPromptOffset(editor, doc, doc.content.size)).toBe(markdown.length)
    // An offset inside a pill's token lands on its edges.
    const insideImage = markdown.indexOf(image) + 3
    expect(
      markdownPromptOffset(editor, doc, markdownPromptPosition(editor, doc, insideImage))
    ).toBe(markdown.indexOf(image))
    expect(
      markdownPromptOffset(editor, doc, markdownPromptPosition(editor, doc, insideImage, 'after'))
    ).toBe(markdown.indexOf(image) + image.length)
  })
})
