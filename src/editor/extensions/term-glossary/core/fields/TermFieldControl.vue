<script setup>
/**
 * 按字段类型分发的通用控件：text / markdown / term。
 */
import { computed } from 'vue'
import { isTermFieldKind } from './kinds'
import TermFieldMarkdown from './TermFieldMarkdown.vue'
import TermFieldTermRef from './TermFieldTermRef.vue'
import TermFieldText from './TermFieldText.vue'

const props = defineProps({
  kind: { type: String, default: 'text' },
  modelValue: { type: [String, Array], default: '' },
  sourcePath: { type: String, default: '' },
  nodes: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  hostTermTitle: { type: String, default: '' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  showSourcePicker: { type: Boolean, default: true },
  minHeight: { type: Number, default: 120 },
})

const emit = defineEmits(['update:modelValue', 'update:sourcePath'])

const resolvedKind = computed(() =>
  isTermFieldKind(props.kind) ? props.kind : 'text',
)

const textValue = computed(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue.join('，')
    : String(props.modelValue ?? ''),
)

const termValue = computed(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue
    : String(props.modelValue || '')
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
)
</script>

<template>
  <TermFieldText
    v-if="resolvedKind === 'text'"
    :model-value="textValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <TermFieldMarkdown
    v-else-if="resolvedKind === 'markdown'"
    :model-value="textValue"
    :placeholder="placeholder || '添加备注…'"
    :min-height="minHeight"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
  <TermFieldTermRef
    v-else
    :model-value="termValue"
    :source-path="sourcePath"
    :nodes="nodes"
    :label="label"
    :placeholder="placeholder || '选择词条'"
    :disabled="disabled"
    :show-source-picker="showSourcePicker"
    @update:model-value="$emit('update:modelValue', $event)"
    @update:source-path="$emit('update:sourcePath', $event)"
  />
</template>
