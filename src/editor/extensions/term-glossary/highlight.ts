import { Extension, Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { marked } from 'marked'
import { api } from '../../../api'
import { useGlossaryStore } from '../../../stores/glossary'
import { fromStorageMarkdown, toStorageMarkdown } from '../../../editor/blankLines'
import { requestReloadFilePath } from '../../../editor/shellEvents'
import {
  alertError,
  confirmAction,
  confirmChoice,
} from '../../../composables/useDialog'
import {
  TERM_GLOSSARY_ID,
  TERM_NODE_NAME,
  TERM_REF_CLASS,
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_INVALID_CLASS,
  TERM_REF_NODE_NAME,
  TERM_POPOVER_CLASS,
  TERM_PICKER_CLASS,
} from './constants'

import { setActiveTermEditorView } from './editorViewRef'
import { ensureTermGlossaryStyles } from './styles'
import {
  confirmTitleInMarkdown,
  protectTermRefs,
  relatedTitlesForMatch,
  replaceTermBlock,
  sanitizeTermTitle,
  titlePattern,
  titlesContainedInText,
} from './syntax'
import { bindTermFlashView } from './flashTerm'
import {
  collectGlossary,
  findCandidateMatches,
} from './match'
import {
  buildAutoConfirmTransaction,
  replaceRangeWithTermRef,
  selectionAtEditablePos,
} from './convert'
import {
  findTermNodeInDoc,
  serializeTermDescriptionFromNode,
} from './serializeDesc'
import { suppressAutoConfirmForTitle } from './match'
import { commitTermRename } from './renameFlow'
import { TermRefNode } from './termRef'

const pluginKey = new PluginKey('termGlossaryHighlight')
const convertPluginKey = new PluginKey('termGlossaryAutoConfirm')

const DIALOG_W = 400
const DIALOG_H = 150
const DIALOG_MAX_H = 500
const DIALOG_MIN_W = 220
const DIALOG_MIN_H = 120
const DIALOG_GAP = 6
const DIALOG_PAD = 8

interface ResolvedTerm {
  title: string
  description: string
  sourcePath: string
}

type OpenSourceFn = (path: string, focusTermTitle?: string) => void
type OpenTermFn = (title: string, anchor?: HTMLElement | null) => void

function allTitles(doc?: ProseMirrorNode | null): string[] {
  return Array.from(collectGlossary(doc).keys())
}

/**
 * 点击无效 term[标题]：提示是否新建词条；确认后插入定义块并写入 Store。
 * @returns 是否已处理（含用户取消）
 */
async function offerCreateMissingTerm(
  rawTitle: string,
  view?: EditorView | null,
  onOpenExisting?: (title: string) => void,
): Promise<boolean> {
  const title = sanitizeTermTitle(rawTitle)
  if (!title) return false

  try {
    const store = useGlossaryStore()
    if (store.getTerm(title)) return false

    // 撞曾用名
    let ownerOfFormer: string | null = null
    for (const [t, term] of Object.entries(store.terms)) {
      if ((term.formerTitles || []).includes(title)) {
        ownerOfFormer = t
        break
      }
    }
    if (ownerOfFormer) {
      const choice = await confirmChoice(
        `「${title}」是词条「${ownerOfFormer}」的曾用名，请选择：`,
        '曾用名冲突',
        {
          confirmText: '打开已有词条',
          cancelText: '作为新词条',
          type: 'warning',
        },
      )
      if (choice === 'close') return true
      if (choice === 'confirm') {
        onOpenExisting?.(ownerOfFormer)
        return true
      }
      const stripped = store.stripFormerTitle(title)
      await store.persistTerms(stripped)
    } else {
      const ok = await confirmAction(
        `没有对应词条「${title}」，是否新建？`,
        '新建词条',
        { type: 'info', confirmButtonText: '新建', cancelButtonText: '取消' },
      )
      if (!ok) return true
    }

    // 乐观写入 Store，使红线立刻变蓝
    const terms = { ...store.terms }
    terms[title] = {
      title,
      description: '',
      sourcePath: '',
      ignoreContexts: [],
      formerTitles: [],
      pendingManualConfirm: [],
    }
    await store.persistTerms(terms)

    // 当前编辑器内插入定义块
    if (view) {
      const type = view.state.schema.nodes[TERM_NODE_NAME]
      const paragraph = view.state.schema.nodes.paragraph
      if (type && paragraph) {
        const node = type.create({ title }, paragraph.create())
        const tr = view.state.tr.insert(view.state.doc.content.size, node)
        view.dispatch(tr.scrollIntoView())
      }
    }
  } catch (err) {
    console.warn('[term] create missing term failed:', err)
    await alertError(err instanceof Error ? err.message : '新建词条失败')
  }
  return true
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 弹窗描述：当前文档有定义块时优先实时序列化；否则用 Store Markdown。
 * 不用纯文本，避免丢失 # 标题等标记。
 */
function resolveTerm(title: string, doc?: ProseMirrorNode | null): ResolvedTerm {
  const key = String(title ?? '').trim()
  let liveMd = ''
  if (doc) {
    const node = findTermNodeInDoc(doc, key)
    if (node) liveMd = serializeTermDescriptionFromNode(node)
  }

  try {
    const store = useGlossaryStore()
    const term = store.getTerm(key)
    if (term) {
      return {
        title: term.title || key,
        description: liveMd || term.description || '',
        sourcePath: term.sourcePath || '',
      }
    }
  } catch {
    // ignore
  }

  return {
    title: key,
    description: liveMd || '',
    sourcePath: '',
  }
}

/**
 * 弹窗预览：仅给裸命中加灰线候选（已确认 term[] 在 Markdown 阶段已变成 span）。
 */
function highlightCandidatesInElement(
  root: HTMLElement,
  titles: string[],
  selfTitle: string,
): void {
  const sorted = [...titles]
    .filter((t) => t && t !== selfTitle)
    .sort((a, b) => b.length - a.length)
  if (!sorted.length) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = (node as Text).parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (
        parent.closest(
          `code, pre, .${TERM_REF_CLASS}, .${TERM_REF_CANDIDATE_CLASS}`,
        )
      ) {
        return NodeFilter.FILTER_REJECT
      }
      if (!(node as Text).data.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const textNode of textNodes) {
    const text = textNode.data
    type Hit = { from: number; to: number; title: string; candidates: string[] }
    const hits: Hit[] = []
    const taken: Array<{ from: number; to: number }> = []

    for (const termTitle of sorted) {
      const re = titlePattern(termTitle)
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const from = m.index
        const to = from + m[0].length
        if (taken.some((r) => from < r.to && to > r.from)) continue
        taken.push({ from, to })
        const candidates = relatedTitlesForMatch(termTitle, titles)
        hits.push({
          from,
          to,
          title: termTitle,
          candidates: candidates.length ? candidates : [termTitle],
        })
      }
    }
    if (!hits.length) continue

    hits.sort((a, b) => a.from - b.from)
    const frag = document.createDocumentFragment()
    let cursor = 0
    for (const hit of hits) {
      if (hit.from > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, hit.from)))
      }
      const span = document.createElement('span')
      span.className = TERM_REF_CANDIDATE_CLASS
      span.setAttribute('data-term-title', hit.title)
      span.setAttribute('data-term-candidates', hit.candidates.join('\u0001'))
      span.textContent = text.slice(hit.from, hit.to)
      frag.appendChild(span)
      cursor = hit.to
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}

/**
 * 弹窗描述：保护 term[] → Markdown 渲染 → 还原为已确认 span → 灰线候选。
 */
function renderDescriptionHtml(
  description: string,
  titles: string[],
  selfTitle: string,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ext-term-popover-desc'
  const text = description.trim() || '（暂无描述）'
  const { text: protectedMd, titles: refTitles } = protectTermRefs(text)

  try {
    let html = marked.parse(protectedMd, {
      async: false,
      breaks: true,
      gfm: true,
    }) as string

    html = html.replace(/§§TERMREF(\d+)§§/g, (_full, idx: string) => {
      const title = refTitles[Number(idx)] || ''
      if (!title) return ''
      // 描述内与自身同名：保持普通文本
      if (title === selfTitle) return escapeHtml(title)
      const known = titles.includes(title)
      const cls = known
        ? TERM_REF_CLASS
        : `${TERM_REF_CLASS} ext-term-ref-invalid`
      const tip = known ? '' : ' title="没有对应词条，点击可新建"'
      return `<span class="${cls}" data-term-title="${escapeHtml(title)}" data-extension="${TERM_GLOSSARY_ID}"${tip}>${escapeHtml(title)}</span>`
    })
    wrap.innerHTML = html
  } catch {
    wrap.textContent = text
  }

  highlightCandidatesInElement(wrap, titles, selfTitle)
  return wrap
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const matches = findCandidateMatches(doc)
  if (!matches.length) return DecorationSet.empty

  const decorations = matches.map((match) =>
    Decoration.inline(match.from, match.to, {
      class: TERM_REF_CANDIDATE_CLASS,
      'data-term-title': match.matchTitle,
      'data-term-candidates': match.candidates.join('\u0001'),
      'data-extension': TERM_GLOSSARY_ID,
    }),
  )

  return DecorationSet.create(doc, decorations)
}

type ResizeDir = 'e' | 's' | 'se'
/** 与主编辑器一致：edit=渲染预览，source=描述 Markdown 原文 */
type DialogViewMode = 'edit' | 'source'

const ICON_EDIT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>'
const ICON_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>'
const ICON_FILE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>'

/** 单个词条对话框：可拖拽移动，可改尺寸，支持预览 / 源码 / 编辑 */
class TermDialog {
  /** 词条标题（弹窗主键） */
  title: string
  private el: HTMLDivElement | null = null
  private bodyEl: HTMLDivElement | null = null
  private headingEl: HTMLElement | null = null
  private editBtn: HTMLButtonElement | null = null
  private sourceBtn: HTMLButtonElement | null = null
  private pathBtn: HTMLButtonElement | null = null
  private saveBtn: HTMLButtonElement | null = null
  private cancelBtn: HTMLButtonElement | null = null
  private flashTimer: ReturnType<typeof setTimeout> | null = null
  private dragging = false
  private resizing: ResizeDir | null = null
  private dragOffsetX = 0
  private dragOffsetY = 0
  private resizeStartX = 0
  private resizeStartY = 0
  private resizeStartW = 0
  private resizeStartH = 0
  private onPointerMove: ((e: PointerEvent) => void) | null = null
  private onPointerUp: ((e: PointerEvent) => void) | null = null
  private onRemoved: (title: string) => void
  private onRetitle: (oldTitle: string, newTitle: string) => void
  private bringFront: () => number

  private term: ResolvedTerm = { title: '', description: '', sourcePath: '' }
  private titles: string[] = []
  private onOpenSource: OpenSourceFn | undefined
  private onOpenTerm: OpenTermFn = () => {}
  private viewMode: DialogViewMode = 'edit'
  private editing = false
  private draftTitle = ''
  private draftDescription = ''
  private saving = false
  /** 编辑态「文案」视图：迷你 TipTap，与主编辑器 edit 一致 */
  private descEditor: Editor | null = null
  private applyingDesc = false
  /** 用户是否已手动拖过尺寸；未拖过则高度随内容自适应 */
  private userSized = false
  /** 弹窗内灰线候选选择器 */
  private dialogPicker: {
    show: (
      anchor: HTMLElement,
      candidates: string[],
      onPick: (title: string) => void,
    ) => void
    hide: () => void
    destroy: () => void
  } | null = null

  constructor(
    title: string,
    onRemoved: (title: string) => void,
    onRetitle: (oldTitle: string, newTitle: string) => void,
    bringFront: () => number,
  ) {
    this.title = title
    this.onRemoved = onRemoved
    this.onRetitle = onRetitle
    this.bringFront = bringFront
  }

  get isOpen() {
    return !!this.el
  }

  flash() {
    if (!this.el) return
    this.el.classList.remove('is-flash')
    void this.el.offsetWidth
    this.el.classList.add('is-flash')
    if (this.flashTimer) clearTimeout(this.flashTimer)
    this.flashTimer = setTimeout(() => {
      this.el?.classList.remove('is-flash')
      this.flashTimer = null
    }, 900)
  }

  focus() {
    if (!this.el) return
    this.el.style.zIndex = String(this.bringFront())
  }

  show(
    term: ResolvedTerm,
    titles: string[],
    anchor: HTMLElement | null | undefined,
    onOpenSource: OpenSourceFn | undefined,
    onOpenTerm: OpenTermFn,
  ) {
    this.hide(false)
    ensureTermGlossaryStyles()

    this.term = { ...term }
    this.title = term.title
    this.titles = titles
    this.onOpenSource = onOpenSource
    this.onOpenTerm = onOpenTerm
    this.viewMode = 'edit'
    this.editing = false
    this.draftTitle = term.title
    this.draftDescription = term.description
    this.saving = false
    this.userSized = false

    const el = document.createElement('div')
    el.className = TERM_POPOVER_CLASS
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'false')
    el.setAttribute('data-term-title', term.title)
    el.style.width = `${DIALOG_W}px`
    el.style.height = 'auto'
    el.style.maxHeight = `${DIALOG_MAX_H}px`
    el.style.zIndex = String(this.bringFront())

    const header = document.createElement('div')
    header.className = 'ext-term-popover-header'

    const heading = document.createElement('div')
    heading.className = 'ext-term-popover-title'
    header.appendChild(heading)
    this.headingEl = heading

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'ext-term-popover-close'
    closeBtn.setAttribute('aria-label', '关闭')
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.hide()
    })
    header.appendChild(closeBtn)
    el.appendChild(header)

    const body = document.createElement('div')
    body.className = 'ext-term-popover-body'
    this.bodyEl = body
    el.appendChild(body)

    const footer = document.createElement('div')
    footer.className = 'ext-term-popover-footer'

    const footerLeft = document.createElement('div')
    footerLeft.className = 'ext-term-popover-footer-left'

    const editBtn = document.createElement('button')
    editBtn.type = 'button'
    editBtn.className = 'ext-term-popover-tool'
    editBtn.title = '编辑词条'
    editBtn.setAttribute('aria-label', '编辑词条')
    editBtn.innerHTML = ICON_EDIT
    editBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.enterEdit()
    })
    footerLeft.appendChild(editBtn)
    this.editBtn = editBtn

    const sourceBtn = document.createElement('button')
    sourceBtn.type = 'button'
    sourceBtn.className = 'ext-term-popover-tool'
    sourceBtn.title = '切换到源码'
    sourceBtn.setAttribute('aria-label', '切换到源码')
    sourceBtn.setAttribute('aria-pressed', 'false')
    sourceBtn.innerHTML = ICON_SOURCE
    sourceBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.toggleSource()
    })
    footerLeft.appendChild(sourceBtn)
    this.sourceBtn = sourceBtn

    const pathBtn = document.createElement('button')
    pathBtn.type = 'button'
    pathBtn.className = 'ext-term-popover-tool'
    pathBtn.innerHTML = ICON_FILE
    pathBtn.title = term.sourcePath ? `打开 ${term.sourcePath}` : '无来源路径'
    pathBtn.setAttribute('aria-label', pathBtn.title)
    pathBtn.disabled = !term.sourcePath
    pathBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const path = this.term.sourcePath
      const focusTitle = this.term.title
      if (!path) return
      // 只走 store，避免 queueTermFlash 调两次
      this.onOpenSource?.(path, focusTitle)
    })
    footerLeft.appendChild(pathBtn)
    this.pathBtn = pathBtn

    footer.appendChild(footerLeft)

    const footerRight = document.createElement('div')
    footerRight.className = 'ext-term-popover-footer-right'

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'ext-term-popover-action is-muted'
    cancelBtn.textContent = '取消'
    cancelBtn.hidden = true
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.cancelEdit()
    })
    footerRight.appendChild(cancelBtn)
    this.cancelBtn = cancelBtn

    const saveBtn = document.createElement('button')
    saveBtn.type = 'button'
    saveBtn.className = 'ext-term-popover-action'
    saveBtn.textContent = '保存'
    saveBtn.hidden = true
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void this.saveEdit()
    })
    footerRight.appendChild(saveBtn)
    this.saveBtn = saveBtn

    footer.appendChild(footerRight)
    el.appendChild(footer)

    for (const dir of ['e', 's', 'se'] as ResizeDir[]) {
      const handle = document.createElement('div')
      handle.className = `ext-term-popover-resize ext-term-popover-resize-${dir}`
      handle.addEventListener('pointerdown', (e) => this.beginResize(e, dir))
      el.appendChild(handle)
    }

    el.addEventListener('mousedown', () => this.focus())
    el.addEventListener('pointerdown', () => this.focus())

    document.body.appendChild(el)
    this.el = el
    this.renderHeaderTitle()
    this.renderBody()
    this.syncChrome()
    // 等内容布局后再定位，高度随内容自适应
    requestAnimationFrame(() => {
      this.placeBelowAnchor(anchor)
    })
    this.bindMove(header)
  }

  private enterEdit() {
    if (this.editing) return
    this.pullDraftFromInputs()
    this.editing = true
    // 默认进入文案编辑（图1），与主编辑器一致
    this.viewMode = 'edit'
    this.draftTitle = this.term.title
    this.draftDescription = this.term.description
    this.renderHeaderTitle()
    this.renderBody()
    this.syncChrome()
  }

  private cancelEdit() {
    this.destroyDescEditor()
    this.editing = false
    this.viewMode = 'edit'
    this.draftTitle = this.term.title
    this.draftDescription = this.term.description
    this.renderHeaderTitle()
    this.renderBody()
    this.syncChrome()
  }

  private toggleSource() {
    // 先从当前 DOM / TipTap 回收草稿，再切换
    this.pullDraftFromInputs()
    this.viewMode = this.viewMode === 'source' ? 'edit' : 'source'
    this.renderBody()
    this.syncChrome()
  }

  private destroyDescEditor() {
    if (this.descEditor && !this.descEditor.isDestroyed) {
      this.descEditor.destroy()
    }
    this.descEditor = null
    this.applyingDesc = false
  }

  private pullDraftFromInputs() {
    if (!this.el) return
    const titleInput = this.el.querySelector(
      '.ext-term-popover-title-input',
    ) as HTMLInputElement | null
    if (titleInput) this.draftTitle = titleInput.value

    if (
      this.editing &&
      this.viewMode === 'edit' &&
      this.descEditor &&
      !this.descEditor.isDestroyed
    ) {
      this.draftDescription = toStorageMarkdown(this.descEditor.getMarkdown())
      return
    }

    const area = this.el.querySelector(
      '.ext-term-popover-source-input',
    ) as HTMLTextAreaElement | null
    if (area) this.draftDescription = area.value
  }

  private syncChrome() {
    this.el?.classList.toggle('is-editing', this.editing)
    this.el?.classList.toggle('is-source', this.viewMode === 'source')
    if (this.sourceBtn) {
      const isSource = this.viewMode === 'source'
      this.sourceBtn.classList.toggle('is-active', isSource)
      const label = isSource ? '切换到编辑' : '切换到源码'
      this.sourceBtn.title = label
      this.sourceBtn.setAttribute('aria-label', label)
      this.sourceBtn.setAttribute('aria-pressed', isSource ? 'true' : 'false')
    }
    if (this.editBtn) this.editBtn.hidden = this.editing
    if (this.pathBtn) this.pathBtn.hidden = this.editing
    if (this.saveBtn) this.saveBtn.hidden = !this.editing
    if (this.cancelBtn) this.cancelBtn.hidden = !this.editing
  }

  /** 标题区：浏览为文本，编辑为可输入 */
  private renderHeaderTitle() {
    if (!this.headingEl) return
    this.headingEl.replaceChildren()
    if (this.editing) {
      const titleInput = document.createElement('input')
      titleInput.className = 'ext-term-popover-title-input'
      titleInput.type = 'text'
      titleInput.value = this.draftTitle
      titleInput.placeholder = '词条标题'
      titleInput.addEventListener('input', () => {
        this.draftTitle = titleInput.value
      })
      this.headingEl.appendChild(titleInput)
      return
    }
    this.headingEl.textContent = this.term.title || '词条'
  }

  private renderBody() {
    if (!this.bodyEl) return
    this.destroyDescEditor()
    this.bodyEl.replaceChildren()

    const description = this.editing ? this.draftDescription : this.term.description
    const selfTitle = this.term.title

    // —— 编辑中：与主编辑器相同，文案(TipTap) ↔ 源码(textarea) ——
    if (this.editing) {
      if (this.viewMode === 'source') {
        const area = document.createElement('textarea')
        area.className = 'ext-term-popover-source-input'
        area.value = this.draftDescription
        area.placeholder = '词条描述（Markdown）'
        area.spellcheck = false
        area.addEventListener('input', () => {
          this.draftDescription = area.value
        })
        this.bodyEl.appendChild(area)
      } else {
        const host = document.createElement('div')
        host.className = 'ext-term-popover-desc-editor'
        this.bodyEl.appendChild(host)
        this.applyingDesc = true
        this.descEditor = new Editor({
          element: host,
          extensions: [StarterKit, Markdown, TermRefNode, TermGlossaryHighlight],
          content: '',
          editorProps: {
            attributes: {
              class: 'ext-term-popover-tiptap',
              spellcheck: 'false',
            },
          },
          onUpdate: ({ editor }) => {
            if (this.applyingDesc) return
            this.draftDescription = toStorageMarkdown(editor.getMarkdown())
          },
        })
        this.descEditor.commands.setContent(
          fromStorageMarkdown(this.draftDescription || ''),
          { contentType: 'markdown', emitUpdate: false },
        )
        this.applyingDesc = false
      }
      this.fitAutoHeight()
      return
    }

    // —— 浏览：渲染预览 / 描述源码只读 ——
    if (this.viewMode === 'source') {
      const pre = document.createElement('pre')
      pre.className = 'ext-term-popover-source-view'
      pre.textContent = description || ''
      this.bodyEl.appendChild(pre)
      this.fitAutoHeight()
      return
    }

    const desc = renderDescriptionHtml(description, this.titles, selfTitle)
    this.bodyEl.appendChild(desc)
    desc.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null

      const candidate = target?.closest?.(
        `.${TERM_REF_CANDIDATE_CLASS}`,
      ) as HTMLElement | null
      if (candidate && desc.contains(candidate)) {
        e.preventDefault()
        e.stopPropagation()
        const matchTitle =
          candidate.getAttribute('data-term-title') ||
          candidate.textContent ||
          ''
        const raw =
          candidate.getAttribute('data-term-candidates') || matchTitle
        const candidates = raw
          .split('\u0001')
          .map((s) => s.trim())
          .filter(Boolean)
        if (!this.dialogPicker) this.dialogPicker = new CandidatePicker()
        this.dialogPicker.show(candidate, candidates, (picked) => {
          void this.confirmCandidateInDescription(matchTitle.trim(), picked)
        })
        return
      }

      const ref = target?.closest?.(`.${TERM_REF_CLASS}`) as HTMLElement | null
      if (!ref || !desc.contains(ref)) return
      e.preventDefault()
      e.stopPropagation()
      const nested = (
        ref.getAttribute('data-term-title') ||
        ref.textContent ||
        ''
      ).trim()
      if (!nested) return
      if (
        ref.classList.contains(TERM_REF_INVALID_CLASS) ||
        ref.classList.contains('ext-term-ref-invalid')
      ) {
        void offerCreateMissingTerm(nested)
        return
      }
      this.onOpenTerm(nested, ref)
    })
    this.fitAutoHeight()
  }

  /**
   * 弹窗内确认灰线候选：写回定义描述为 term[标题]，并刷新预览 / 源文件。
   */
  private async confirmCandidateInDescription(
    matchTitle: string,
    confirmTitle: string,
  ) {
    const match = String(matchTitle ?? '').trim()
    const confirm = String(confirmTitle ?? '').trim()
    if (!match || !confirm || this.saving) return

    const nextDescription = confirmTitleInMarkdown(
      this.term.description,
      match,
      confirm,
    )
    if (nextDescription === this.term.description) return

    this.saving = true
    try {
      const title = this.term.title
      const sourcePath = this.term.sourcePath
      if (sourcePath) {
        const slash = sourcePath.indexOf('/')
        const tab = sourcePath.slice(0, slash)
        const file = sourcePath.slice(slash + 1)
        const { content } = await api.getFile(tab, file)
        const nextMd = replaceTermBlock(
          content,
          title,
          title,
          nextDescription,
        )
        await api.saveFile(tab, file, nextMd)
        await useGlossaryStore().syncFile(tab, file, nextMd)
        requestReloadFilePath(sourcePath)
      } else {
        const store = useGlossaryStore()
        const terms = { ...store.terms }
        const prev = terms[title]
        if (prev) {
          terms[title] = { ...prev, description: nextDescription }
          await store.persistTerms(terms)
        }
      }

      this.term = { ...this.term, description: nextDescription }
      this.draftDescription = nextDescription
      this.renderBody()
      this.fitAutoHeight()
    } catch (err) {
      console.warn('[term-dialog] confirm candidate failed:', err)
      await alertError(err instanceof Error ? err.message : '确认词条失败')
    } finally {
      this.saving = false
    }
  }

  /** 未手动改尺寸时，高度随内容；封顶 DIALOG_MAX_H */
  private fitAutoHeight() {
    if (!this.el || this.userSized) return
    this.el.style.height = 'auto'
    this.el.style.maxHeight = `${DIALOG_MAX_H}px`
  }

  private async saveEdit() {
    if (this.saving || !this.editing) return
    this.pullDraftFromInputs()
    const newTitle = sanitizeTermTitle(this.draftTitle)
    const newDescription = this.draftDescription.replace(/\u00a0/g, ' ')
    if (!newTitle) {
      await alertError('词条标题不能为空', '提示')
      return
    }

    const store = useGlossaryStore()
    // 新增/改名撞到其他词条的曾用名
    if (newTitle !== sanitizeTermTitle(this.term.title)) {
      let ownerOfFormer: string | null = null
      for (const [title, term] of Object.entries(store.terms)) {
        if (title === sanitizeTermTitle(this.term.title)) continue
        if ((term.formerTitles || []).includes(newTitle)) {
          ownerOfFormer = title
          break
        }
      }
      if (ownerOfFormer) {
        const choice = await confirmChoice(
          `「${newTitle}」是词条「${ownerOfFormer}」的曾用名，请选择：`,
          '曾用名冲突',
          {
            confirmText: '打开已有词条',
            cancelText: '作为新词条',
            type: 'warning',
          },
        )
        if (choice === 'close') return
        if (choice === 'confirm') {
          this.cancelEdit()
          this.onOpenTerm(ownerOfFormer, this.el)
          return
        }
        const stripped = store.stripFormerTitle(newTitle)
        await store.persistTerms(stripped)
      }
    }

    this.saving = true
    if (this.saveBtn) {
      this.saveBtn.disabled = true
      this.saveBtn.textContent = '保存中…'
    }

    try {
      const oldTitle = sanitizeTermTitle(this.term.title)
      const sourcePath = this.term.sourcePath
      const renamed = oldTitle !== newTitle

      // 改名落盘前先抑制，避免编辑区正文同名被自动确认
      if (renamed) suppressAutoConfirmForTitle(newTitle)

      if (sourcePath) {
        const slash = sourcePath.indexOf('/')
        const tab = sourcePath.slice(0, slash)
        const file = sourcePath.slice(slash + 1)
        const { content } = await api.getFile(tab, file)
        const nextMd = replaceTermBlock(
          content,
          oldTitle || this.term.title,
          newTitle,
          newDescription,
        )
        await api.saveFile(tab, file, nextMd)

        if (renamed) {
          await commitTermRename({
            oldTitle,
            newTitle,
            description: newDescription.trim(),
            sourcePath,
            saveCurrent: false,
          })
        } else {
          await store.syncFile(tab, file, nextMd)
          requestReloadFilePath(sourcePath)
        }
      } else if (renamed) {
        await commitTermRename({
          oldTitle,
          newTitle,
          description: newDescription.trim(),
          sourcePath: '',
          saveCurrent: false,
        })
      } else {
        const terms = { ...store.terms }
        const prev = terms[oldTitle]
        terms[newTitle] = {
          title: newTitle,
          description: newDescription.trim(),
          sourcePath: '',
          ignoreContexts: prev?.ignoreContexts || [],
          formerTitles: prev?.formerTitles || [],
          pendingManualConfirm: prev?.pendingManualConfirm || [],
        }
        await store.persistTerms(terms)
      }

      if (renamed) {
        this.onRetitle(oldTitle, newTitle)
        this.title = newTitle
        this.el?.setAttribute('data-term-title', newTitle)
      }

      this.term = {
        title: newTitle,
        description: newDescription.trim(),
        sourcePath: this.term.sourcePath,
      }
      this.titles = Array.from(new Set([...this.titles, newTitle]))
      this.editing = false
      this.viewMode = 'edit'
      this.renderHeaderTitle()
      this.renderBody()
      this.syncChrome()
    } catch (err) {
      console.warn('[term-dialog] save failed:', err)
      await alertError(err instanceof Error ? err.message : '保存失败')
    } finally {
      this.saving = false
      if (this.saveBtn) {
        this.saveBtn.disabled = false
        this.saveBtn.textContent = '保存'
      }
    }
  }

  /** 出现在锚点下方；默认左对齐，右侧放不下则改为右对齐 */
  private placeBelowAnchor(anchor: HTMLElement | null | undefined) {
    if (!this.el) return
    const el = this.el
    const w = el.offsetWidth || DIALOG_W
    const h = el.offsetHeight || DIALOG_H

    if (!anchor || !document.body.contains(anchor)) {
      const left = Math.max(DIALOG_PAD, Math.round((window.innerWidth - w) / 2))
      const top = Math.max(DIALOG_PAD, Math.round((window.innerHeight - h) / 3))
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      return
    }

    const rect = anchor.getBoundingClientRect()

    let left = rect.left
    if (left + w + DIALOG_PAD > window.innerWidth) {
      left = rect.right - w
    }
    if (left < DIALOG_PAD) left = DIALOG_PAD
    if (left + w + DIALOG_PAD > window.innerWidth) {
      left = window.innerWidth - w - DIALOG_PAD
    }

    let top = rect.bottom + DIALOG_GAP
    if (top + h + DIALOG_PAD > window.innerHeight) {
      const above = rect.top - h - DIALOG_GAP
      top = above >= DIALOG_PAD ? above : DIALOG_PAD
    }

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
  }

  private bindMove(header: HTMLElement) {
    header.addEventListener('pointerdown', (e) => {
      if (!this.el) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('.ext-term-popover-close')) return
      if (target?.closest?.('.ext-term-popover-title-input')) return
      e.preventDefault()
      this.focus()
      this.dragging = true
      const rect = this.el.getBoundingClientRect()
      this.dragOffsetX = e.clientX - rect.left
      this.dragOffsetY = e.clientY - rect.top
      header.classList.add('is-dragging')
      this.ensureWindowListeners()
      header.setPointerCapture?.(e.pointerId)
    })
  }

  private beginResize(e: PointerEvent, dir: ResizeDir) {
    if (!this.el) return
    e.preventDefault()
    e.stopPropagation()
    this.focus()
    // 先锁住当前可视尺寸，再进入拖拽（否则 height:auto 会顶住）
    const rect = this.el.getBoundingClientRect()
    this.el.style.width = `${Math.round(rect.width)}px`
    this.el.style.height = `${Math.round(rect.height)}px`
    this.el.style.maxHeight = 'none'
    this.userSized = true
    this.resizing = dir
    this.resizeStartX = e.clientX
    this.resizeStartY = e.clientY
    this.resizeStartW = rect.width
    this.resizeStartH = rect.height
    this.ensureWindowListeners()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  private ensureWindowListeners() {
    if (this.onPointerMove) return
    this.onPointerMove = (e: PointerEvent) => {
      if (this.dragging && this.el) {
        const pad = 8
        const rect = this.el.getBoundingClientRect()
        let left = e.clientX - this.dragOffsetX
        let top = e.clientY - this.dragOffsetY
        left = Math.min(Math.max(pad, left), window.innerWidth - rect.width - pad)
        top = Math.min(Math.max(pad, top), window.innerHeight - rect.height - pad)
        this.el.style.left = `${Math.round(left)}px`
        this.el.style.top = `${Math.round(top)}px`
        return
      }
      if (this.resizing && this.el) {
        const dx = e.clientX - this.resizeStartX
        const dy = e.clientY - this.resizeStartY
        let w = this.resizeStartW
        let h = this.resizeStartH
        if (this.resizing === 'e' || this.resizing === 'se') {
          w = Math.max(DIALOG_MIN_W, this.resizeStartW + dx)
        }
        if (this.resizing === 's' || this.resizing === 'se') {
          h = Math.max(DIALOG_MIN_H, Math.min(DIALOG_MAX_H, this.resizeStartH + dy))
        }
        const maxW = window.innerWidth - this.el.offsetLeft - 8
        const maxH = Math.min(
          DIALOG_MAX_H,
          window.innerHeight - this.el.offsetTop - 8,
        )
        this.el.style.width = `${Math.round(Math.min(w, maxW))}px`
        this.el.style.height = `${Math.round(Math.min(h, maxH))}px`
      }
    }
    this.onPointerUp = () => {
      this.dragging = false
      this.resizing = null
      this.el
        ?.querySelector('.ext-term-popover-header')
        ?.classList.remove('is-dragging')
    }
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
  }

  hide(notify = true) {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer)
      this.flashTimer = null
    }
    if (this.onPointerMove) {
      window.removeEventListener('pointermove', this.onPointerMove)
      this.onPointerMove = null
    }
    if (this.onPointerUp) {
      window.removeEventListener('pointerup', this.onPointerUp)
      this.onPointerUp = null
    }
    this.dialogPicker?.destroy()
    this.dialogPicker = null
    this.destroyDescEditor()
    this.dragging = false
    this.resizing = null
    this.el?.remove()
    this.el = null
    this.bodyEl = null
    this.headingEl = null
    this.editBtn = null
    this.sourceBtn = null
    this.pathBtn = null
    this.saveBtn = null
    this.cancelBtn = null
    if (notify) this.onRemoved(this.title)
  }

  destroy() {
    this.hide(false)
  }
}

/** 多词条弹窗管理：每个标题一个独立实例 */
class TermDialogManager {
  private dialogs = new Map<string, TermDialog>()
  private zIndex = 10000
  private doc: ProseMirrorNode | null = null
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null

  setDoc(doc: ProseMirrorNode | null) {
    this.doc = doc
  }

  private nextZ() {
    this.zIndex += 1
    return this.zIndex
  }

  private ensureKeys() {
    if (this.onKeyDown) return
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !this.dialogs.size) return
      let topTitle = ''
      let topZ = -1
      for (const dialog of this.dialogs.values()) {
        const node = document.querySelector(
          `.${TERM_POPOVER_CLASS}[data-term-title="${CSS.escape(dialog.title)}"]`,
        ) as HTMLElement | null
        const z = node ? Number(node.style.zIndex || 0) : 0
        if (z >= topZ) {
          topZ = z
          topTitle = dialog.title
        }
      }
      this.dialogs.get(topTitle)?.hide()
    }
    document.addEventListener('keydown', this.onKeyDown)
  }

  open(
    title: string,
    onOpenSource?: OpenSourceFn,
    anchor?: HTMLElement | null,
  ) {
    const key = String(title ?? '').trim()
    if (!key) return

    const existing = this.dialogs.get(key)
    if (existing?.isOpen) {
      existing.focus()
      existing.flash()
      return
    }

    this.ensureKeys()
    const term = resolveTerm(key, this.doc)
    const titles = allTitles(this.doc)
    const dialog = new TermDialog(
      key,
      (t) => {
        this.dialogs.delete(t)
        if (!this.dialogs.size && this.onKeyDown) {
          document.removeEventListener('keydown', this.onKeyDown)
          this.onKeyDown = null
        }
      },
      (oldTitle, newTitle) => {
        const d = this.dialogs.get(oldTitle)
        if (!d) return
        this.dialogs.delete(oldTitle)
        this.dialogs.set(newTitle, d)
      },
      () => this.nextZ(),
    )
    this.dialogs.set(key, dialog)
    dialog.show(
      term,
      titles,
      anchor,
      onOpenSource,
      (nestedTitle, nestedAnchor) =>
        this.open(nestedTitle, onOpenSource, nestedAnchor),
    )
  }

  destroy() {
    for (const dialog of [...this.dialogs.values()]) {
      dialog.destroy()
    }
    this.dialogs.clear()
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown)
      this.onKeyDown = null
    }
  }
}

/**
 * 未确认候选：点击弹出选择面板。
 */
class CandidatePicker {
  private el: HTMLDivElement | null = null

  hide() {
    this.el?.remove()
    this.el = null
  }

  show(
    anchor: HTMLElement,
    candidates: string[],
    onPick: (title: string) => void,
  ) {
    this.hide()
    const el = document.createElement('div')
    el.className = TERM_PICKER_CLASS
    el.setAttribute('data-extension', TERM_GLOSSARY_ID)

    const label = document.createElement('div')
    label.className = 'ext-term-picker-label'
    label.textContent = candidates.length > 1 ? '选择词条' : '确认词条'
    el.appendChild(label)

    const list = document.createElement('div')
    list.className = 'ext-term-picker-list'
    for (const title of candidates) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ext-term-picker-item'
      btn.textContent = title
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.hide()
        onPick(title)
      })
      list.appendChild(btn)
    }
    el.appendChild(list)
    document.body.appendChild(el)
    this.el = el

    const rect = anchor.getBoundingClientRect()
    const pad = 6
    let left = rect.left
    let top = rect.bottom + pad
    requestAnimationFrame(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
      if (left < 8) left = 8
      if (top + h > window.innerHeight - 8) top = rect.top - h - pad
      if (top < 8) top = 8
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(top)}px`
    })
  }

  destroy() {
    this.hide()
  }
}

/**
 * 选区「不是词条」按钮：选中文案须包含未确认命中，且选区不能恰好等于某个词条标题。
 */
class NotTermBar {
  private el: HTMLButtonElement | null = null

  hide() {
    this.el?.remove()
    this.el = null
  }

  show(anchorRect: DOMRect, onClick: () => void) {
    this.hide()
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ext-term-not-term'
    btn.textContent = '不是词条'
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.hide()
      onClick()
    })
    document.body.appendChild(btn)
    this.el = btn
    const w = btn.offsetWidth || 72
    let left = anchorRect.left + (anchorRect.width - w) / 2
    let top = anchorRect.bottom + 6
    if (left < 8) left = 8
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
    if (top + 32 > window.innerHeight - 8) top = anchorRect.top - 36
    btn.style.left = `${Math.round(left)}px`
    btn.style.top = `${Math.round(top)}px`
  }

  destroy() {
    this.hide()
  }
}

/**
 * 正文 / 词条描述：已确认引用节点高亮；未确认灰线候选；空格 / term[] 自动确认。
 */
export const TermGlossaryHighlight = Extension.create({
  name: 'termGlossaryHighlight',

  onCreate() {
    ensureTermGlossaryStyles()
  },

  addProseMirrorPlugins() {
    const manager = new TermDialogManager()
    const picker = new CandidatePicker()
    const notTermBar = new NotTermBar()

    const hideUi = () => {
      picker.hide()
      notTermBar.hide()
    }

    return [
      new Plugin({
        key: convertPluginKey,
        state: {
          init: () => ({ skipAfterUnconfirm: false }),
          apply(tr, value) {
            if (tr.getMeta('termGlossaryUnconfirm')) {
              return { skipAfterUnconfirm: true }
            }
            // 消费掉一次：后续文档变更再恢复自动确认调度
            if (value.skipAfterUnconfirm && tr.docChanged) {
              return { skipAfterUnconfirm: false }
            }
            return value
          },
        },
        // 防抖自动确认：IME / 连续输入停约 400ms 后再写 term[]
        view(editorView) {
          setActiveTermEditorView(editorView)
          let timer: ReturnType<typeof setTimeout> | null = null
          let composing = false
          /** 跳过由本插件 dispatch 触发的二次 schedule，避免与输入打架 */
          let skipSchedule = false

          const run = () => {
            if (composing || editorView.isDestroyed) return
            if (convertPluginKey.getState(editorView.state)?.skipAfterUnconfirm) {
              return
            }
            // pendingManualConfirm 非空只禁止「裸文案自动包 term[]」，
            // 不要拆已确认的 termRef，否则用户刚确认又会被拆回灰线
            const tr = editorView.state.tr
            const next = buildAutoConfirmTransaction(tr, editorView.state.schema)
            if (!next) return
            next.setMeta(convertPluginKey, { skip: true })
            skipSchedule = true
            editorView.dispatch(next)
            try {
              editorView.focus()
            } catch {
              // ignore
            }
          }

          const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(run, 400)
          }

          const onCompStart = () => {
            composing = true
            if (timer) clearTimeout(timer)
          }
          const onCompEnd = () => {
            composing = false
            schedule()
          }
          editorView.dom.addEventListener('compositionstart', onCompStart)
          editorView.dom.addEventListener('compositionend', onCompEnd)
          // 初次进入也扫一次（打开已有文档）
          schedule()

          return {
            update(view, prevState) {
              if (view.state.doc.eq(prevState.doc)) return
              if (skipSchedule) {
                skipSchedule = false
                return
              }
              // 用户点 ×：清掉待执行的自动确认，并跳过本轮 schedule
              if (convertPluginKey.getState(view.state)?.skipAfterUnconfirm) {
                if (timer) clearTimeout(timer)
                timer = null
                return
              }
              schedule()
            },
            destroy() {
              if (timer) clearTimeout(timer)
              editorView.dom.removeEventListener('compositionstart', onCompStart)
              editorView.dom.removeEventListener('compositionend', onCompEnd)
              setActiveTermEditorView(null)
            },
          }
        },
        props: {
          /**
           * 选中整个 termRef（NodeSelection）时直接打字会“没反应”或整颗删掉；
           * 先把光标挪到 atom 后方再插入字符。
           */
          handleKeyDown(view, event) {
            const { selection } = view.state
            if (!(selection instanceof NodeSelection)) return false
            if (selection.node.type.name !== TERM_REF_NODE_NAME) return false
            if (event.ctrlKey || event.metaKey || event.altKey) return false
            if (event.isComposing) return false

            const isPrintable =
              event.key.length === 1 || event.key === 'Enter' || event.key === 'Process'
            if (!isPrintable) return false

            const after = selection.to
            const tr = view.state.tr.setSelection(
              selectionAtEditablePos(view.state.doc, after),
            )
            if (event.key === 'Enter') {
              view.dispatch(tr.split(tr.selection.from))
              return true
            }
            if (event.key.length === 1) {
              view.dispatch(tr.insertText(event.key))
              return true
            }
            view.dispatch(tr)
            return false
          },
          /** DOM 选区若误入 contenteditable=false 的 atom，校正回可编辑位置 */
          handleDOMEvents: {
            beforeinput(view, event) {
              const sel = view.state.selection
              if (sel instanceof NodeSelection) return false
              if (!(sel instanceof TextSelection) || !sel.empty) return false
              const $pos = sel.$from
              if ($pos.nodeAfter?.type.name === TERM_REF_NODE_NAME) {
                // 紧贴 atom 前输入是合法的，不必拦截
                return false
              }
              const anchor = window.getSelection()?.anchorNode as Node | null
              if (!anchor) return false
              const inRef =
                anchor instanceof Element
                  ? anchor.closest?.(`.${TERM_REF_CLASS}`)
                  : anchor.parentElement?.closest?.(`.${TERM_REF_CLASS}`)
              if (!inRef) return false

              event.preventDefault()
              const pos = view.posAtDOM(inRef, inRef.childNodes.length)
              const tr = view.state.tr.setSelection(
                selectionAtEditablePos(view.state.doc, pos),
              )
              const data = (event as InputEvent).data
              if (data) tr.insertText(data)
              view.dispatch(tr)
              return true
            },
          },
        },
      }),
      new Plugin({
        key: pluginKey,
        state: {
          init: (_, state) => {
            manager.setDoc(state.doc)
            return buildDecorations(state.doc)
          },
          apply: (tr, old, _oldState, newState) => {
            manager.setDoc(newState.doc)
            if (tr.docChanged || tr.getMeta(pluginKey)?.refresh) {
              return buildDecorations(newState.doc)
            }
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)
          },
          handleDOMEvents: {
            mousedown: (_view, event) => {
              const t = event.target as HTMLElement | null
              if (
                t?.closest?.(`.${TERM_PICKER_CLASS}`) ||
                t?.closest?.('.ext-term-not-term')
              ) {
                return false
              }
              if (
                !t?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`) &&
                !t?.closest?.(`.${TERM_PICKER_CLASS}`)
              ) {
                picker.hide()
              }
              return false
            },
            click: (view, event) => {
              const target = event.target as HTMLElement | null
              if (target?.closest?.('.ext-term-ref-close')) return false
              if (target?.closest?.(`.${TERM_POPOVER_CLASS}`)) return false
              if (target?.closest?.(`.${TERM_PICKER_CLASS}`)) return false

              const candidate = target?.closest?.(
                `.${TERM_REF_CANDIDATE_CLASS}`,
              ) as HTMLElement | null
              if (candidate) {
                event.preventDefault()
                event.stopPropagation()
                const matchTitle =
                  candidate.getAttribute('data-term-title') || ''
                const raw =
                  candidate.getAttribute('data-term-candidates') || matchTitle
                const candidates = raw
                  .split('\u0001')
                  .map((s) => s.trim())
                  .filter(Boolean)
                const pos = view.posAtDOM(candidate, 0)
                const end = view.posAtDOM(candidate, candidate.childNodes.length)
                const from = Math.min(pos, end)
                const to = Math.max(pos, end)
                picker.show(candidate, candidates, (title) => {
                  const tr = view.state.tr
                  if (
                    !replaceRangeWithTermRef(
                      tr,
                      view.state.schema,
                      from,
                      to,
                      title,
                    )
                  ) {
                    return
                  }
                  tr.setMeta(convertPluginKey, { skip: true })
                  view.dispatch(tr)
                })
                return true
              }

              const ref = target?.closest?.(
                `.${TERM_REF_CLASS}`,
              ) as HTMLElement | null
              if (!ref) return false

              const termTitle = (
                ref.getAttribute('data-term-title') ||
                ref.querySelector('.ext-term-ref-text')?.textContent ||
                ref.textContent ||
                ''
              ).trim()

              if (
                ref.classList.contains(TERM_REF_INVALID_CLASS) ||
                ref.classList.contains('ext-term-ref-invalid')
              ) {
                event.preventDefault()
                event.stopPropagation()
                void offerCreateMissingTerm(termTitle, view, (existing) => {
                  manager.setDoc(view.state.doc)
                  manager.open(
                    existing,
                    (path, focusTermTitle) => {
                      try {
                        useGlossaryStore().requestOpenSource(
                          path,
                          focusTermTitle || existing,
                        )
                      } catch {
                        // ignore
                      }
                    },
                    ref,
                  )
                })
                return true
              }
              if (ref.classList.contains(TERM_REF_CANDIDATE_CLASS)) return false

              manager.setDoc(view.state.doc)
              manager.open(
                termTitle,
                (path, focusTermTitle) => {
                  try {
                    useGlossaryStore().requestOpenSource(
                      path,
                      focusTermTitle || termTitle,
                    )
                  } catch {
                    // Pinia 未就绪
                  }
                },
                ref,
              )
              return true
            },
            mouseup: (view) => {
              window.setTimeout(() => {
                const { from, to, empty } = view.state.selection
                if (empty || to <= from) {
                  notTermBar.hide()
                  return
                }
                const selected = view.state.doc.textBetween(from, to, '')
                const trimmed = selected.trim()
                if (!trimmed) {
                  notTermBar.hide()
                  return
                }

                const titles = allTitles(view.state.doc)
                // 选区恰好等于某个词条标题 → 不出现「不是词条」
                if (titles.includes(trimmed)) {
                  notTermBar.hide()
                  return
                }

                const candidates = findCandidateMatches(view.state.doc)
                const overlaps = candidates.some(
                  (c) => c.from < to && c.to > from,
                )
                if (!overlaps) {
                  notTermBar.hide()
                  return
                }

                // 选区须包含至少一个未确认命中的标题文本
                const hitTitles = titlesContainedInText(trimmed, titles)
                if (!hitTitles.length) {
                  notTermBar.hide()
                  return
                }

                let coords: { left: number; right: number; top: number; bottom: number }
                try {
                  const start = view.coordsAtPos(from)
                  const end = view.coordsAtPos(to)
                  coords = {
                    left: Math.min(start.left, end.left),
                    right: Math.max(start.right, end.right),
                    top: Math.min(start.top, end.top),
                    bottom: Math.max(start.bottom, end.bottom),
                  }
                } catch {
                  notTermBar.hide()
                  return
                }

                notTermBar.show(
                  {
                    left: coords.left,
                    top: coords.top,
                    right: coords.right,
                    bottom: coords.bottom,
                    width: coords.right - coords.left,
                    height: coords.bottom - coords.top,
                    x: coords.left,
                    y: coords.top,
                    toJSON: () => ({}),
                  } as DOMRect,
                  () => {
                    void useGlossaryStore()
                      .addIgnoreContext(trimmed, hitTitles)
                      .then(() => {
                        const tr = view.state.tr.setMeta(pluginKey, {
                          refresh: true,
                        })
                        view.dispatch(tr)
                      })
                  },
                )
              }, 0)
              return false
            },
          },
        },
        view(editorView) {
          manager.setDoc(editorView.state.doc)
          bindTermFlashView(editorView)
          let unsubscribe: (() => void) | null = null
          try {
            unsubscribe = useGlossaryStore().$subscribe(() => {
              const tr = editorView.state.tr.setMeta(pluginKey, { refresh: true })
              editorView.dispatch(tr)
            })
          } catch {
            // Pinia 尚未就绪
          }

          const onDocClick = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null
            if (
              t?.closest?.(`.${TERM_PICKER_CLASS}`) ||
              t?.closest?.('.ext-term-not-term') ||
              t?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`)
            ) {
              return
            }
            hideUi()
          }
          document.addEventListener('mousedown', onDocClick)

          return {
            update(view) {
              manager.setDoc(view.state.doc)
              bindTermFlashView(view)
            },
            destroy() {
              document.removeEventListener('mousedown', onDocClick)
              unsubscribe?.()
              bindTermFlashView(null)
              manager.destroy()
              picker.destroy()
              notTermBar.destroy()
            },
          }
        },
      }),
    ]
  },
})

export default TermGlossaryHighlight
