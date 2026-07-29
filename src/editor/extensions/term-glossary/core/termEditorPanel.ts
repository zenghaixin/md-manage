/**
 * 右侧「词条」书签：新建 / 编辑定义；未确认关闭则丢弃。
 */
import { createApp, type App } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { Editor } from '@tiptap/core'
import { getActivePinia } from 'pinia'
import { useGlossaryStore } from '../../../../stores/glossary'
import {
  requestCloseRightPanel,
  requestOpenRightPanel,
  requestSaveCurrentFile,
  onRightPanelDismiss,
} from '../../../shellEvents'
import {
  registerRightPanelModule,
  notifyRightPanelModulesChanged,
} from '../../../rightPanelRegistry'
import { alertError } from '../../../../composables/useDialog'
import { ensureTermGlossaryStyles } from './styles'
import { sanitizeTermTitle } from './syntax'
import { serializeTermDescriptionFromNode } from './serializeDesc'
import {
  normalizeTermType,
  TERM_TYPE_BASIC,
  type TermTypeId,
} from './termTypes'
import { commitTermRename } from './renameFlow'
import { TERM_NODE_NAME } from './constants'
import {
  insertTermDefinition,
  replaceTermDefinition,
} from './termOps'
import TermEditorPanel from './TermEditorPanel.vue'

export const TERM_EDITOR_MODULE_ID = 'term-editor'

type CreateSession = {
  mode: 'create'
  editor: Editor
  termType: TermTypeId
  insertPos: number
}

type EditSession = {
  mode: 'edit'
  editor: Editor
  termType: TermTypeId
  nodePos: number
  title: string
  description: string
}

type Session = CreateSession | EditSession

type ConfirmPayload = {
  title: string
  description: string
  termType: TermTypeId
}

let session: Session | null = null
let vueApp: App | null = null
let rootEl: HTMLDivElement | null = null
let stopDismiss: (() => void) | null = null
let moduleBound = false
/** 确认成功后关闭，避免 unmount 当丢弃 */
let closingAfterConfirm = false

function hasSession() {
  return !!session
}

function teardownMount() {
  stopDismiss?.()
  stopDismiss = null
  if (vueApp) {
    try {
      vueApp.unmount()
    } catch {
      // ignore
    }
    vueApp = null
  }
  rootEl?.remove()
  rootEl = null
}

function discardSession() {
  session = null
  closingAfterConfirm = false
  notifyRightPanelModulesChanged()
}

function present(host: HTMLElement) {
  const s = session
  if (!s) return
  ensureTermGlossaryStyles()
  teardownMount()
  host.replaceChildren()
  const root = document.createElement('div')
  root.className = 'ext-term-editor-panel-root h-full min-h-0'
  host.appendChild(root)
  rootEl = root

  stopDismiss = onRightPanelDismiss(() => {
    // 壳层关掉右栏 = 丢弃
    discardSession()
    teardownMount()
  })

  vueApp = createApp(TermEditorPanel, {
    mode: s.mode,
    initialTitle: s.mode === 'edit' ? s.title : '',
    initialDescription: s.mode === 'edit' ? s.description : '',
    initialType: s.termType,
    onConfirm: (payload: ConfirmPayload) => {
      void handleConfirm(payload)
    },
    onCancel: () => {
      closePanelDiscard()
    },
  })
  const pinia = getActivePinia()
  if (pinia) vueApp.use(pinia)
  vueApp.use(ElementPlus, { locale: zhCn })
  vueApp.mount(root)
}

function closePanelDiscard() {
  discardSession()
  teardownMount()
  notifyRightPanelModulesChanged()
  requestCloseRightPanel()
}

function closePanelAfterConfirm() {
  closingAfterConfirm = true
  session = null
  teardownMount()
  notifyRightPanelModulesChanged()
  requestCloseRightPanel()
  closingAfterConfirm = false
}

async function handleConfirm(payload: ConfirmPayload) {
  const s = session
  if (!s) return
  const editor = s.editor
  if (editor.isDestroyed) {
    closePanelDiscard()
    return
  }

  const title = sanitizeTermTitle(payload.title)
  const description = String(payload.description ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
  const termType = normalizeTermType(payload.termType)
  if (!title) {
    await alertError('请填写词条标题')
    return
  }
  if (!description) {
    await alertError('请填写词条描述')
    return
  }

  const store = useGlossaryStore()

  if (s.mode === 'create') {
    if (store.getTerm(title)) {
      await alertError(`词条「${title}」已存在`)
      return
    }
    const ok = insertTermDefinition(editor, {
      title,
      description,
      termType,
      at: s.insertPos,
    })
    if (!ok) {
      await alertError('插入词条失败')
      return
    }
    try {
      const terms = { ...store.terms }
      terms[title] = {
        title,
        description,
        sourcePath: '',
        type: termType,
        ignoreContexts: [],
        formerTitles: [],
        pendingManualConfirm: [],
      }
      await store.persistTerms(terms)
    } catch (err) {
      console.warn('[term-editor] persist create failed:', err)
    }
    requestSaveCurrentFile()
    closePanelAfterConfirm()
    return
  }

  // edit
  const oldTitle = sanitizeTermTitle(s.title)
  const node = editor.state.doc.nodeAt(s.nodePos)
  if (!node || node.type.name !== TERM_NODE_NAME) {
    await alertError('词条位置已失效，请关闭后重试')
    closePanelDiscard()
    return
  }

  if (oldTitle && oldTitle !== title) {
    if (store.getTerm(title) && title !== oldTitle) {
      await alertError(`词条「${title}」已存在`)
      return
    }
    const replaced = replaceTermDefinition(editor, {
      pos: s.nodePos,
      title,
      description,
      termType,
    })
    if (!replaced) {
      await alertError('更新词条失败')
      return
    }
    try {
      await commitTermRename({
        oldTitle,
        newTitle: title,
        description,
        saveCurrent: true,
        editor,
      })
      await store.upsertTermType(title, termType)
      const prev = store.getTerm(title)
      if (prev && (prev.description !== description || prev.type !== termType)) {
        const terms = {
          ...store.terms,
          [title]: { ...prev, description, type: termType },
        }
        await store.persistTerms(terms)
      }
    } catch (err) {
      console.warn('[term-editor] rename/persist failed:', err)
    }
    closePanelAfterConfirm()
    return
  }

  const replaced = replaceTermDefinition(editor, {
    pos: s.nodePos,
    title,
    description,
    termType,
  })
  if (!replaced) {
    await alertError('更新词条失败')
    return
  }
  try {
    const prev = store.getTerm(title)
    const terms = {
      ...store.terms,
      [title]: prev
        ? { ...prev, description, type: termType }
        : {
            title,
            description,
            sourcePath: '',
            type: termType,
            ignoreContexts: [],
            formerTitles: [],
            pendingManualConfirm: [],
          },
    }
    await store.persistTerms(terms)
  } catch (err) {
    console.warn('[term-editor] persist edit failed:', err)
  }
  requestSaveCurrentFile()
  closePanelAfterConfirm()
}

function openSession(next: Session) {
  session = next
  closingAfterConfirm = false
  notifyRightPanelModulesChanged()
  requestOpenRightPanel({ moduleId: TERM_EDITOR_MODULE_ID })
}

/** 选类型后：右栏新建（正文暂不插入） */
export function openTermEditorCreate(opts: {
  editor: Editor
  termType?: TermTypeId | string
  insertPos: number
}) {
  if (opts.editor.isDestroyed) return
  openSession({
    mode: 'create',
    editor: opts.editor,
    termType: normalizeTermType(opts.termType ?? TERM_TYPE_BASIC),
    insertPos: opts.insertPos,
  })
}

/** 从定义块打开编辑 */
export function openTermEditorEdit(opts: {
  editor: Editor
  nodePos: number
}) {
  const { editor, nodePos } = opts
  if (editor.isDestroyed) return
  const node = editor.state.doc.nodeAt(nodePos)
  if (!node || node.type.name !== 'termGlossary') return
  const title = sanitizeTermTitle(node.attrs.title) || String(node.attrs.title ?? '')
  const description = serializeTermDescriptionFromNode(node)
  const stored = title ? useGlossaryStore().getTerm(title) : null
  const termType = normalizeTermType(
    node.attrs.termType || stored?.type || TERM_TYPE_BASIC,
  )
  openSession({
    mode: 'edit',
    editor,
    termType,
    nodePos,
    title,
    description,
  })
}

export function bindTermEditorPanel() {
  if (moduleBound) return
  moduleBound = true
  registerRightPanelModule({
    id: TERM_EDITOR_MODULE_ID,
    label: '词条',
    order: 15,
    isVisible: () => hasSession(),
    mount(host) {
      if (!session) return
      present(host)
    },
    unmount() {
      teardownMount()
      // 切走书签且未确认 → 丢弃
      if (!closingAfterConfirm && session) {
        discardSession()
      }
    },
  })
}
