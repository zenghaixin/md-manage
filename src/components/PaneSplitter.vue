<script setup>
/**
 * 可拖拽竖向分割条：视觉很细，命中区域略宽便于拖拽。
 */
const emit = defineEmits(['dragstart', 'drag', 'dragend'])

function onPointerDown(e) {
  if (e.button !== 0) return
  e.preventDefault()
  const target = e.currentTarget
  target.setPointerCapture?.(e.pointerId)
  const startX = e.clientX
  emit('dragstart', { clientX: startX })

  const onMove = (ev) => {
    emit('drag', { clientX: ev.clientX, deltaX: ev.clientX - startX })
  }
  const onUp = (ev) => {
    target.releasePointerCapture?.(ev.pointerId)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    emit('dragend')
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}
</script>

<template>
  <div
    class="pane-splitter relative z-10 w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent active:bg-accent"
    role="separator"
    aria-orientation="vertical"
    @pointerdown="onPointerDown"
  />
</template>

<style scoped>
/* 可视 1px，左右各扩出命中区 */
.pane-splitter::before {
  content: '';
  position: absolute;
  inset: 0 -3px;
}
</style>
