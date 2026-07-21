<script setup>
import { computed, useAttrs } from 'vue'
import { Icon } from '@iconify/vue'
import { icons } from '../icons'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  /** icons.js 中的别名，如 folder / edit */
  name: { type: String, default: '' },
  /** 直接传 Icônes 名称，如 lucide:folder；优先于 name */
  icon: { type: String, default: '' },
  size: { type: [Number, String], default: '1em' },
})

const attrs = useAttrs()

const iconId = computed(() => {
  if (props.icon) return props.icon
  if (props.name && icons[props.name]) return icons[props.name]
  return props.name || props.icon
})
</script>

<template>
  <Icon
    v-bind="attrs"
    :icon="iconId"
    :width="size"
    :height="size"
    class="app-icon inline-block shrink-0 align-middle"
    aria-hidden="true"
  />
</template>
