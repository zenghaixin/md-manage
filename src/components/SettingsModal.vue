<script setup>
import { computed } from 'vue'
import { useTheme } from '../composables/useTheme'
import { useMediaQuery } from '../composables/useMediaQuery'

const open = defineModel({ type: Boolean, default: false })

const { preference, setTheme } = useTheme()
const isMobile = useMediaQuery('(max-width: 767px)')
const drawerSize = computed(() => (isMobile.value ? '85%' : '22rem'))

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
</script>

<template>
  <el-drawer
    v-model="open"
    title="设置"
    direction="rtl"
    :size="drawerSize"
    append-to-body
    destroy-on-close
    class="settings-drawer"
  >
    <section>
      <div class="flex items-center justify-between gap-4">
        <div class="text-[0.95rem] font-semibold text-nowrap text-ink">主题</div>
        <el-select
          :model-value="preference"
          class="w-36"
          aria-label="主题"
          @update:model-value="setTheme"
        >
          <el-option
            v-for="opt in themeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
    </section>
  </el-drawer>
</template>
