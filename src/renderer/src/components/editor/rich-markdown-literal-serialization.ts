import type { Editor, JSONContent } from '@tiptap/core'
import { getRichMarkdownSerializationDocument } from './rich-markdown-trailing-paragraph'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { encodeRawMarkdownHtmlForRichEditor } from './raw-markdown-html'
import type { RichMarkdownEditorCodec } from './rich-markdown-source-transport'

const MAX_LITERAL_BLOCK_CODE_UNITS = 50_000
const LITERAL_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList'
])

function withoutOptionalEscapes(markdown: string): string {
  // Consume escaped backslashes first; underscore runs must be wholly inside a word.
  return markdown.replace(
    /\\\\|(?<=[\p{L}\p{N}\p{M}])(?:\\_)+(?=[\p{L}\p{N}\p{M}])|\\[[\]]/gu,
    (escaped) => (escaped === '\\\\' ? escaped : escaped.replace(/\\/g, ''))
  )
}

const literalSerializers = new WeakMap<Editor, (document: ProseMirrorNode) => string>()

/** Serializes any document of this editor's schema as `getMarkdown` serializes its own. */
export function serializeRichMarkdownDocument(editor: Editor, document: ProseMirrorNode): string {
  return literalSerializers.get(editor)?.(document) ?? editor.markdown!.serialize(document.toJSON())
}

export function preserveLiteralMarkdownSource(
  editor: Editor,
  codec: RichMarkdownEditorCodec,
  htmlSuperscriptLinks: boolean
): void {
  const manager = editor.markdown!
  const render = manager.renderNodeToMarkdown.bind(manager)
  const cache = new WeakMap<ProseMirrorNode, { markdown: string; result: string }>()
  let blocks: Map<JSONContent, ProseMirrorNode> | undefined

  manager.renderNodeToMarkdown = (node, ...args) => {
    const markdown = render(node, ...args)
    const block = blocks?.get(node)
    if (!block || !/\\[_[\]~`*]/.test(markdown)) {
      return markdown
    }
    // Retain existing large paragraph/heading fidelity; cap only the expanded validation.
    const preservesBrackets =
      (node.type === 'paragraph' || node.type === 'heading') && /\\[[\]]/.test(markdown)
    if (markdown.length > MAX_LITERAL_BLOCK_CODE_UNITS && !preservesBrackets) {
      return markdown
    }
    const cached = cache.get(block)
    if (cached?.markdown === markdown) {
      return cached.result
    }
    let result = markdown
    const candidates = [
      withoutOptionalEscapes,
      ...['~', '`', '*'].map(
        (character) => (source: string) =>
          source.replace(/\\([\\_~`*])/g, (escaped, value) =>
            value === character ? value : escaped
          )
      )
    ]
    for (const unescape of candidates) {
      const candidate = unescape(result)
      if (candidate === result) {
        continue
      }
      try {
        const parsed = manager.parse(
          encodeRawMarkdownHtmlForRichEditor(candidate, codec, { htmlSuperscriptLinks })
        )
        // Every mark, attribute and text position must survive reopening this block.
        if (
          parsed.content?.length === 1 &&
          editor.schema.nodeFromJSON(parsed.content[0]).eq(block)
        ) {
          result = candidate
        }
      } catch {
        // Keep escapes when a custom parser cannot prove equivalence.
      }
    }
    cache.set(block, { markdown, result })
    return result
  }

  const serialize = (document: ProseMirrorNode): string => {
    const json = document.toJSON()
    const markdown = manager.serialize(json)
    if (!/\\[_[\]~`*]/.test(markdown)) {
      return markdown
    }
    // Reference definitions can change inline meaning across block boundaries.
    if (/\][ \t]*:/.test(withoutOptionalEscapes(markdown))) {
      return markdown
    }
    blocks = new Map()
    json.content?.forEach((node, index) => {
      if (node.type && LITERAL_BLOCK_TYPES.has(node.type)) {
        blocks!.set(node, document.child(index))
      }
    })
    try {
      return manager.serialize(json)
    } finally {
      blocks = undefined
    }
  }
  literalSerializers.set(editor, serialize)
  editor.getMarkdown = () => serialize(getRichMarkdownSerializationDocument(editor))
}
