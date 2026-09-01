<script setup>
/**
 * 普通文本字段：单行输入。
 */
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <input
    class="term-field-text"
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="$emit('update:modelValue', $event.target.value)"
  >
</template>

<style scoped>
.term-field-text {
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
  line-height: 1.25;
  min-height: calc(0.8125rem * 1.25 + 0.9rem + 2px);
}

.term-field-text:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.term-field-text:focus {
  outline: none;
  border-color: var(--accent, #0d6e6e);
}
</style>
