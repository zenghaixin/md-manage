<script setup>
/**
 * 词条预览浮层：DraggableFloat + 描述 HTML 预览。
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import AppIcon from '../../../../../components/AppIcon.vue'
import DraggableFloat from '../../../../../components/draggable-float/DraggableFloat.vue'
import { api } from '../../../../../api'
import { useGlossaryStore } from '../../../../../stores/glossary'
import { alertError } from '../../../../../composables/useDialog'
import {
  requestReloadFilePath,
  requestSaveCurrentFile,
} from '../../../../shellEvents'
import { getKeyPicker } from '../../../../../components/key-picker'
import {
  TERM_POPOVER_CLASS,
  TERM_REF_CANDIDATE_CLASS,
  TERM_REF_CLASS,
  TERM_REF_INVALID_CLASS,
} from '../shared/constants'
import { ensureTermGlossaryStyles } from '../shared/styles'
import { confirmTitleInMarkdown, replaceTermBlock } from '../model/syntax'
import { renderDescriptionHtml } from './dialogHtml'
import { offerCreateMissingTerm } from './createMissingTerm'
import { openTermEditorEditByTitle } from '../panel/termEditorPanel'
import { openTermRemarkFloat } from '../shared/openTermRemarkFloat'
import { lookupLiveTermRemarkId } from '../shared/termRemarkAccess'
import { lookupTermRemarkInMarkdown } from '../shared/remoteTermRemark'
import { buildTermDisplayFields } from '../shared/termDisplayFields'

const DIALOG_W = 400
const DIALOG_MAX_H = 500
/** 预览内候选气泡来源 id（关闭预览时仅关此来源） */
const PREVIEW_PICKER_SOURCE = 'term-preview-float'

const props = defineProps({
  term: {
    type: Object,
    required: true,
  },
  titles: { type: Array, default: () => [] },
  zIndex: { type: Number, default: 10000 },
  /** cascade 分配的初始位置 */
  floatLeft: { type: Number, default: null },
  floatTop: { type: Number, default: null },
  onOpenSource: { type: Function, default: null },
  onOpenTerm: { type: Function, default: null },
  onClose: { type: Function, default: null },
  onFocus: { type: Function, default: null },
})

const floatRef = ref(null)
const descHost = ref(null)
const localTerm = ref({ ...props.term })
const localTitles = ref([...props.titles])
const saving = ref(false)
/** @type {import('vue').Ref<Array<{ label: string, value: string }>>} */
const displayFields = ref([])

ensureTermGlossaryStyles()

const titleText = computed(() => localTerm.value.title || '词条')
const sourcePath = computed(() => String(localTerm.value.sourcePath || ''))
const remarkId = computed(() => String(localTerm.value.remarkId || '').trim())
/** 已有整块备注时才显示入口（不在预览里新建备注） */
const showRemarkBtn = computed(() => !!remarkId.value)
const pathTitle = computed(() =>
  sourcePath.value ? `打开 ${sourcePath.value}` : '无来源路径',
)

async function refreshDisplayFields() {
  const store = useGlossaryStore()
  displayFields.value = await buildTermDisplayFields({
    sourcePath: String(localTerm.value.sourcePath || ''),
    extraFields: localTerm.value.extraFields || [],
    refs: localTerm.value.refs || {},
    refSources: localTerm.value.refSources || [],
    indexEntries: store.index?.entries || [],
  })
}

/** 从当前文档定义块补全 remarkId */
function refreshRemarkIdFromEditor() {
  const id = lookupLiveTermRemarkId(localTerm.value.title)
  if (!id || id === String(localTerm.value.remarkId || '').trim()) return
  localTerm.value = { ...localTerm.value, remarkId: id }
}

/** 定义在其它文件时：只读解析是否已有备注（不创建） */
async function refreshRemarkIdFromSource() {
  if (remarkId.value) return
  const path = sourcePath.value
  const title = localTerm.value.title
  if (!path || !title) return
  try {
    const { content } = await api.getFileByPath(path)
    const looked = lookupTermRemarkInMarkdown(content, title)
    if (looked.remarkId) {
      localTerm.value = { ...localTerm.value, remarkId: looked.remarkId }
    }
  } catch {
    // ignore
  }
}

function renderDesc() {
  const host = descHost.value
  if (!host) return
  host.replaceChildren()
  const desc = renderDescriptionHtml(
    String(localTerm.value.description || ''),
    localTitles.value,
    localTerm.value.title,
  )
  host.appendChild(desc)
  desc.addEventListener('click', onDescClick)
}

async function confirmCandidate(matchTitle, confirmTitle) {
  const match = String(matchTitle ?? '').trim()
  const confirm = String(confirmTitle ?? '').trim()
  if (!match || !confirm || saving.value) return
  const nextDescription = confirmTitleInMarkdown(
    localTerm.value.description,
    match,
    confirm,
  )
  if (nextDescription === localTerm.value.description) return

  saving.value = true
  try {
    const title = localTerm.value.title
    const path = sourcePath.value
    if (path) {
      const { content } = await api.getFileByPath(path)
      const nextMd = replaceTermBlock(content, title, title, nextDescription)
      await api.saveFileByPath(path, nextMd)
      await useGlossaryStore().syncFileByPath(path, nextMd)
      requestReloadFilePath(path)
    } else {
      const store = useGlossaryStore()
      const terms = { ...store.terms }
      const prev = terms[title]
      if (prev) {
        terms[title] = { ...prev, description: nextDescription }
        await store.persistTerms(terms)
      }
    }
    localTerm.value = { ...localTerm.value, description: nextDescription }
    renderDesc()
  } catch (err) {
    console.warn('[term-preview] confirm candidate failed:', err)
    await alertError(err instanceof Error ? err.message : '确认词条失败')
  } finally {
    saving.value = false
  }
}

function onDescClick(e) {
  const target = e.target
  const host = descHost.value
  if (!host) return

  const candidate = target?.closest?.(`.${TERM_REF_CANDIDATE_CLASS}`)
  if (candidate && host.contains(candidate)) {
    e.preventDefault()
    e.stopPropagation()
    const matchTitle =
      candidate.getAttribute('data-term-title') || candidate.textContent || ''
    const raw =
      candidate.getAttribute('data-term-candidates') || matchTitle
    const candidates = raw
      .split('\u0001')
      .map((s) => s.trim())
      .filter(Boolean)
    getKeyPicker().show({
      anchor: candidate,
      titles: candidates,
      sourceId: PREVIEW_PICKER_SOURCE,
      selectMode: 'tab',
      passive: true,
      onPick: (picked) => {
        void confirmCandidate(matchTitle.trim(), picked)
      },
    })
    return
  }

  const refEl = target?.closest?.(`.${TERM_REF_CLASS}`)
  if (!refEl || !host.contains(refEl)) return
  e.preventDefault()
  e.stopPropagation()
  const nested = (
    refEl.getAttribute('data-term-title') ||
    refEl.textContent ||
    ''
  ).trim()
  if (!nested) return
  if (
    refEl.classList.contains(TERM_REF_INVALID_CLASS) ||
    refEl.classList.contains('ext-term-ref-invalid')
  ) {
    void offerCreateMissingTerm(nested)
    return
  }
  props.onOpenTerm?.(nested, refEl)
}

function isKnownTermTitle(title) {
  const t = String(title || '').trim()
  if (!t) return false
  try {
    return !!useGlossaryStore().getTerm(t)
  } catch {
    return localTitles.value.includes(t)
  }
}

function onFieldRefClick(e, title) {
  e.preventDefault()
  e.stopPropagation()
  const t = String(title || '').trim()
  if (!t) return
  const anchor = e.currentTarget
  if (!isKnownTermTitle(t)) {
    void offerCreateMissingTerm(t)
    return
  }
  props.onOpenTerm?.(t, anchor)
}

function onEdit() {
  const rect = floatRef.value?.getBoundingClientRect?.()
  openTermEditorEditByTitle({
    title: localTerm.value.title,
    besideRect: rect
      ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        }
      : null,
  })
}

function onOpenPath() {
  const path = sourcePath.value
  if (!path) return
  props.onOpenSource?.(path, localTerm.value.title)
}

function onOpenRemark() {
  const rect = floatRef.value?.getBoundingClientRect?.()
  void openTermRemarkFloat({
    title: localTerm.value.title,
    sourcePath: sourcePath.value,
    besideRect: rect
      ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        }
      : null,
  }).then(() => {
    refreshRemarkIdFromEditor()
  })
}

function syncFromResolved(term, titles) {
  const nextTitle = String(term.title ?? localTerm.value.title).trim()
  const nextDesc = String(term.description ?? '')
  const nextPath = String(term.sourcePath ?? '')
  const nextRemark = String(term.remarkId ?? '').trim()
  const same =
    localTerm.value.title === nextTitle &&
    localTerm.value.description === nextDesc &&
    localTerm.value.sourcePath === nextPath &&
    String(localTerm.value.remarkId || '') === nextRemark
  if (titles) localTitles.value = [...titles]
  if (same) {
    refreshRemarkIdFromEditor()
    return
  }
  localTerm.value = {
    title: nextTitle,
    description: nextDesc,
    sourcePath: nextPath,
    remarkId: nextRemark,
    refs: term.refs || {},
    refSources: term.refSources || [],
    extraFields: term.extraFields || [],
  }
  renderDesc()
  refreshRemarkIdFromEditor()
  void refreshDisplayFields()
}

watch(
  () => [props.term, props.titles],
  () => {
    localTerm.value = { ...props.term }
    localTitles.value = [...props.titles]
    renderDesc()
    refreshRemarkIdFromEditor()
    void refreshRemarkIdFromSource()
    void refreshDisplayFields()
  },
)

onMounted(() => {
  renderDesc()
  refreshRemarkIdFromEditor()
  void refreshRemarkIdFromSource()
  void refreshDisplayFields()
})

onBeforeUnmount(() => {
  const picker = getKeyPicker()
  if (picker.isOpen && picker.currentSourceId === PREVIEW_PICKER_SOURCE) {
    picker.hide()
  }
})

defineExpose({
  flash: () => floatRef.value?.flash?.(),
  setZIndex: (z) => floatRef.value?.setZIndex?.(z),
  setPosition: (left, top) => floatRef.value?.setPosition?.(left, top),
  getBoundingClientRect: () => floatRef.value?.getBoundingClientRect?.(),
  syncFromResolved,
  title: titleText,
})
</script>

<template>
  <DraggableFloat
    ref="floatRef"
    :title="titleText"
    :width="DIALOG_W"
    :height="null"
    :max-height="DIALOG_MAX_H"
    :left="props.floatLeft"
    :top="props.floatTop"
    :z-index="zIndex"
    :resizable="true"
    :root-class="TERM_POPOVER_CLASS"
    :data-term-title="titleText"
    @close="onClose?.()"
    @focus="onFocus?.()"
  >
    <div
      v-if="displayFields.length"
      class="ext-term-preview-fields"
    >
      <div
        v-for="(row, idx) in displayFields"
        :key="`${row.label}:${idx}`"
        class="ext-term-preview-field-row"
      >
        <span class="ext-term-preview-field-label">{{ row.label }}</span>
        <span class="ext-term-preview-field-value">
          <template v-if="row.kind === 'term'">
            <span
              v-for="(t, ti) in row.titles"
              :key="`${t}:${ti}`"
              class="ext-term-display-term-wrap"
            >
              <span
                v-if="ti > 0"
                class="ext-term-display-sep"
              >、</span>
              <span
                :class="[
                  TERM_REF_CLASS,
                  { [TERM_REF_INVALID_CLASS]: !isKnownTermTitle(t) },
                ]"
                :data-term-title="t"
                :title="isKnownTermTitle(t) ? undefined : '没有对应词条，点击可新建'"
                @click="onFieldRefClick($event, t)"
              >{{ t }}</span>
            </span>
          </template>
          <template v-else>{{ row.value }}</template>
        </span>
      </div>
    </div>
    <div
      ref="descHost"
      class="ext-term-preview-body"
    />
    <template #footer>
      <div class="ext-term-preview-footer-left">
        <button
          type="button"
          class="ext-term-popover-tool"
          title="编辑词条"
          aria-label="编辑词条"
          @click="onEdit"
        >
          <AppIcon name="edit" :size="14" />
        </button>
        <button
          type="button"
          class="ext-term-popover-tool"
          :title="pathTitle"
          :aria-label="pathTitle"
          :disabled="!sourcePath"
          @click="onOpenPath"
        >
          <AppIcon name="file" :size="14" />
        </button>
        <button
          v-if="showRemarkBtn"
          type="button"
          class="ext-term-popover-tool"
          title="打开备注"
          aria-label="打开备注"
          @click="onOpenRemark"
        >
          <AppIcon name="remark" :size="14" />
        </button>
      </div>
    </template>
  </DraggableFloat>
</template>

<style scoped>
.ext-term-preview-fields {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  margin: 0.35rem 0.75rem 0;
  padding: 0;
  background: transparent;
}

.ext-term-preview-field-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35em 0.55em;
  font-size: 0.8125rem;
  line-height: 1.45;
}

.ext-term-preview-field-label {
  flex: 0 0 auto;
  min-width: 3.2em;
  color: var(--muted, #5a6b75);
  font-weight: 400;
  opacity: 0.72;
}

.ext-term-preview-field-label::after {
  content: ' ·';
  opacity: 0.55;
}

.ext-term-preview-field-value {
  flex: 1 1 12em;
  min-width: 0;
  color: var(--ink, #1a2830);
  word-break: break-word;
}

.ext-term-preview-field-value :deep(.ext-term-ref) {
  padding-right: 0;
  font-weight: 500;
}

.ext-term-preview-field-value :deep(.ext-term-ref::before),
.ext-term-preview-field-value :deep(.ext-term-ref::after) {
  content: none;
}

.ext-term-preview-body {
  padding: 0.55rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.45;
  word-break: break-word;
}

.ext-term-preview-footer-left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
