<script setup>
/**
 * 通用可拖拽浮层：标题栏拖动、可选改尺寸、关闭、插槽。
 * 不做遮罩、不做模态锁定。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { nextFloatZIndex } from './floatZIndex'

const props = defineProps({
  title: { type: String, default: '' },
  width: { type: Number, default: 360 },
  /**
   * 初始高度；传 null 则随内容自适应（受 maxHeight 限制），
   * 用户拖拽改尺寸后锁定为像素高度。
   */
  height: { type: Number, default: null },
  minWidth: { type: Number, default: 220 },
  minHeight: { type: Number, default: 120 },
  maxHeight: { type: Number, default: 500 },
  zIndex: { type: Number, default: 10050 },
  left: { type: Number, default: null },
  top: { type: Number, default: null },
  /** 右/下/右下角拖拽改尺寸 */
  resizable: { type: Boolean, default: false },
  rootClass: { type: String, default: '' },
  dataTermTitle: { type: String, default: '' },
})

const emit = defineEmits(['close', 'focus', 'resize'])

const rootEl = ref(null)
const posLeft = ref(0)
const posTop = ref(0)
const sizeW = ref(props.width)
const sizeH = ref(typeof props.height === 'number' ? props.height : null)
const flashing = ref(false)
/** 实际层高：点击置顶时改这个，避免被 props.zIndex 盖回去 */
const layerZ = ref(props.zIndex)

let dragging = false
let dragOffsetX = 0
let dragOffsetY = 0
/** @type {null | 'e' | 's' | 'se'} */
let resizing = null
let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0
let onMove = null
let onUp = null
let flashTimer = null

const rootStyle = computed(() => {
  const style = {
    left: `${posLeft.value}px`,
    top: `${posTop.value}px`,
    width: `${sizeW.value}px`,
    zIndex: layerZ.value,
  }
  if (sizeH.value == null) {
    style.height = 'auto'
    style.maxHeight = `${props.maxHeight}px`
  } else {
    style.height = `${sizeH.value}px`
    style.maxHeight = 'none'
  }
  return style
})

function clampToViewport(x, y, w, h) {
  const pad = 8
  const maxX = Math.max(pad, window.innerWidth - w - pad)
  const maxY = Math.max(pad, window.innerHeight - h - pad)
  return {
    left: Math.min(maxX, Math.max(pad, x)),
    top: Math.min(maxY, Math.max(pad, y)),
  }
}

function placeInitial() {
  const w = sizeW.value
  const h = sizeH.value ?? props.minHeight
  const hasLeft = typeof props.left === 'number'
  const hasTop = typeof props.top === 'number'
  if (hasLeft || hasTop) {
    const x = hasLeft ? props.left : window.innerWidth - w - 24
    const y = hasTop
      ? props.top
      : Math.max(24, Math.round((window.innerHeight - h) / 2))
    const next = clampToViewport(x, y, w, h)
    posLeft.value = next.left
    posTop.value = next.top
    return
  }
  const x = window.innerWidth - w - 24
  const y = Math.max(24, Math.round((window.innerHeight - h) / 2))
  const next = clampToViewport(x, y, w, h)
  posLeft.value = next.left
  posTop.value = next.top
}

function onHeaderPointerDown(e) {
  if (e.button != null && e.button !== 0) return
  const target = e.target
  if (target?.closest?.('.draggable-float__close')) return
  if (target?.closest?.('[data-no-drag]')) return
  const el = rootEl.value
  if (!el) return
  layerZ.value = nextFloatZIndex()
  emit('focus')
  dragging = true
  dragOffsetX = e.clientX - posLeft.value
  dragOffsetY = e.clientY - posTop.value
  el.classList.add('is-dragging')
  e.preventDefault()
}

function beginResize(e, dir) {
  if (!props.resizable) return
  const el = rootEl.value
  if (!el) return
  e.preventDefault()
  e.stopPropagation()
  layerZ.value = nextFloatZIndex()
  emit('focus')
  const rect = el.getBoundingClientRect()
  sizeW.value = Math.round(rect.width)
  sizeH.value = Math.round(rect.height)
  resizing = dir
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartW = rect.width
  resizeStartH = rect.height
  e.currentTarget?.setPointerCapture?.(e.pointerId)
}

function bindPointerListeners() {
  onMove = (e) => {
    if (dragging) {
      const el = rootEl.value
      const w = el?.offsetWidth || sizeW.value
      const h = el?.offsetHeight || sizeH.value || props.minHeight
      const next = clampToViewport(
        e.clientX - dragOffsetX,
        e.clientY - dragOffsetY,
        w,
        h,
      )
      posLeft.value = next.left
      posTop.value = next.top
      return
    }
    if (resizing && rootEl.value) {
      const dx = e.clientX - resizeStartX
      const dy = e.clientY - resizeStartY
      let w = resizeStartW
      let h = resizeStartH
      if (resizing === 'e' || resizing === 'se') {
        w = Math.max(props.minWidth, resizeStartW + dx)
      }
      if (resizing === 's' || resizing === 'se') {
        h = Math.max(
          props.minHeight,
          Math.min(props.maxHeight, resizeStartH + dy),
        )
      }
      const maxW = window.innerWidth - posLeft.value - 8
      const maxH = Math.min(
        props.maxHeight,
        window.innerHeight - posTop.value - 8,
      )
      sizeW.value = Math.round(Math.min(w, maxW))
      sizeH.value = Math.round(Math.min(h, maxH))
      emit('resize', { width: sizeW.value, height: sizeH.value })
    }
  }
  onUp = () => {
    if (dragging) {
      dragging = false
      rootEl.value?.classList.remove('is-dragging')
    }
    resizing = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function onCloseClick(e) {
  e.stopPropagation()
  emit('close')
}

function onRootPointerDown() {
  layerZ.value = nextFloatZIndex()
  emit('focus')
}

function flash() {
  flashing.value = false
  requestAnimationFrame(() => {
    flashing.value = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flashing.value = false
      flashTimer = null
    }, 900)
  })
}

function setZIndex(z) {
  layerZ.value = Number(z) || layerZ.value
}

function setPosition(left, top) {
  const el = rootEl.value
  const w = el?.offsetWidth || sizeW.value
  const h = el?.offsetHeight || sizeH.value || props.minHeight
  const next = clampToViewport(left, top, w, h)
  posLeft.value = next.left
  posTop.value = next.top
}

function getBoundingClientRect() {
  return rootEl.value?.getBoundingClientRect() ?? null
}

watch(
  () => props.zIndex,
  (z) => {
    if (typeof z === 'number' && z > layerZ.value) {
      layerZ.value = z
    }
  },
)

watch(
  () => props.dataTermTitle,
  (t) => {
    if (rootEl.value) {
      if (t) rootEl.value.setAttribute('data-term-title', t)
      else rootEl.value.removeAttribute('data-term-title')
    }
  },
)

onMounted(() => {
  placeInitial()
  bindPointerListeners()
  if (props.dataTermTitle && rootEl.value) {
    rootEl.value.setAttribute('data-term-title', props.dataTermTitle)
  }
})

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
  if (onMove) window.removeEventListener('pointermove', onMove)
  if (onUp) {
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
  onMove = null
  onUp = null
})

defineExpose({
  flash,
  setZIndex,
  setPosition,
  getBoundingClientRect,
  rootEl,
})
</script>

<template>
  <div
    ref="rootEl"
    class="draggable-float"
    :class="[rootClass, { 'is-flash': flashing, 'is-resizable': resizable }]"
    :style="rootStyle"
    role="dialog"
    aria-modal="false"
    @pointerdown="onRootPointerDown"
  >
    <header
      class="draggable-float__header"
      @pointerdown="onHeaderPointerDown"
    >
      <div class="draggable-float__title">
        <slot name="title">{{ title }}</slot>
      </div>
      <slot name="header-extra" />
      <button
        type="button"
        class="draggable-float__close"
        aria-label="关闭"
        title="关闭"
        @click="onCloseClick"
      >
        ×
      </button>
    </header>
    <div class="draggable-float__body">
      <slot />
    </div>
    <footer
      v-if="$slots.footer"
      class="draggable-float__footer"
    >
      <slot name="footer" />
    </footer>
    <template v-if="resizable">
      <div
        class="draggable-float__resize draggable-float__resize-e"
        @pointerdown="beginResize($event, 'e')"
      />
      <div
        class="draggable-float__resize draggable-float__resize-s"
        @pointerdown="beginResize($event, 's')"
      />
      <div
        class="draggable-float__resize draggable-float__resize-se"
        @pointerdown="beginResize($event, 'se')"
      />
    </template>
  </div>
</template>

<style scoped>
.draggable-float {
  position: fixed;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 220px;
  min-height: 120px;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 8px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  box-shadow: 0 12px 32px rgba(26, 40, 48, 0.18);
  overflow: hidden;
  pointer-events: auto;
  transition: border-color 0.15s ease;
}

.draggable-float.is-dragging {
  user-select: none;
}

.draggable-float.is-flash {
  animation: draggable-float-flash 0.9s ease;
}

@keyframes draggable-float-flash {
  0%, 100% { border-color: var(--border, #c5d0d8); }
  20%, 60% {
    border-color: #f59e0b;
    box-shadow:
      0 0 0 2px color-mix(in srgb, #f59e0b 35%, transparent),
      0 12px 32px rgba(26, 40, 48, 0.18);
  }
  40%, 80% {
    border-color: #2563eb;
    box-shadow:
      0 0 0 2px color-mix(in srgb, #2563eb 35%, transparent),
      0 12px 32px rgba(26, 40, 48, 0.18);
  }
}

.draggable-float__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
  min-height: 2.25rem;
  padding: 0.35rem 0.45rem 0.35rem 0.75rem;
  border-bottom: 1px solid var(--border, #c5d0d8);
  background: color-mix(in srgb, var(--surface, #f4f7f9) 88%, var(--ink, #1a2830));
  cursor: move;
  user-select: none;
  touch-action: none;
}

.draggable-float.is-dragging .draggable-float__header {
  cursor: grabbing;
}

.draggable-float__title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  font-size: 0.9rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draggable-float__close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #6b7c88);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.draggable-float__close:hover {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: var(--ink, #1a2830);
}

.draggable-float__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.draggable-float__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border-top: 1px solid var(--border, #c5d0d8);
}

.draggable-float__resize {
  position: absolute;
  z-index: 2;
}

.draggable-float__resize-e {
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
}

.draggable-float__resize-s {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 6px;
  cursor: ns-resize;
}

.draggable-float__resize-se {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
}

.draggable-float__resize-se::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 7px;
  height: 7px;
  border-right: 2px solid color-mix(in srgb, currentColor 35%, transparent);
  border-bottom: 2px solid color-mix(in srgb, currentColor 35%, transparent);
}
</style>
