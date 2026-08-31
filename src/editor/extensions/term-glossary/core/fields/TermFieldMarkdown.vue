<script setup>
/**
 * 备注式文本字段：多行纯文本（与词条预览/描述用的 MarkdownField 区分）。
 * 样式对齐备注浮层 RemarkFloat。
 */
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '添加备注…' },
  /** 兼容旧调用，忽略 */
  hostTermTitle: { type: String, default: '' },
  /** 兼容旧调用，忽略 */
  termRef: { type: Boolean, default: true },
  minHeight: { type: Number, default: 120 },
  /** 兼容旧调用，忽略 */
  showToggle: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <textarea
    class="term-field-markdown"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :style="{ minHeight: `${Math.max(72, Number(minHeight) || 120)}px` }"
    spellcheck="false"
    @input="$emit('update:modelValue', $event.target.value)"
  />
</template>

<style scoped>
.term-field-markdown {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border, #c5d0d8);
  border-radius: 6px;
  background: var(--surface, #f4f7f9);
  color: var(--ink, #1a2830);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.5;
  resize: vertical;
}

.term-field-markdown:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  resize: none;
}

.term-field-markdown:focus {
  outline: none;
  border-color: var(--accent, #0d6e6e);
}
</style>
