<!--
 * @Author: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @Date: 2026-07-16 11:07:36
 * @LastEditors: error: error: git config user.name & please set dead value or install git && error: git config user.email & please set dead value or install git & please set dead value or install git
 * @LastEditTime: 2026-07-16 12:10:19
 * @FilePath: \setting\src\components\SettingsModal.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<script setup>
import { useTheme } from '../composables/useTheme'

const open = defineModel({ type: Boolean, default: false })

const { preference, setTheme } = useTheme()

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
</script>

<template>
  <el-dialog
    v-model="open"
    title="设置"
    width="28rem"
    align-center
    destroy-on-close
    class="settings-dialog"
  >
    <section>
      <div class="flex items-center justify-between gap-4">
        <div class="text-[0.95rem] font-semibold text-ink text-nowrap">主题</div>
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
  </el-dialog>
</template>
