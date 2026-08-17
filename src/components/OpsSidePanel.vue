<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { setRightPanelHost } from '../editor/shellEvents'

const props = defineProps({
  open: { type: Boolean, default: false },
  width: { type: Number, default: 320 },
  /** @type {{ id: string, label: string }[]} */
  bookmarks: { type: Array, default: () => [] },
  activeModuleId: { type: String, default: '' },
})

const emit = defineEmits(['toggle', 'select-module'])

const hostRef = ref(null)

const bookmarkOffset = computed(() => {
  // 开关凸耳下方开始叠书签
  return '2.85rem'
})

watch(
  [() => props.open, hostRef],
  () => {
    setRightPanelHost(props.open ? hostRef.value : null)
  },
  { flush: 'post' },
)

defineExpose({
  getHost: () => hostRef.value,
  /** 等 host 挂载后取节点 */
  async waitHost() {
    await nextTick()
    await nextTick()
    return hostRef.value
  },
})
</script>

<template>
  <aside
    class="ops-side-panel relative h-full shrink-0 overflow-visible"
    :class="open ? 'flex min-h-0 flex-col border-l border-border bg-surface' : 'w-0'"
    :style="open ? { width: `${width}px` } : undefined"
  >
    <!-- 开合凸耳：始终在面板左缘 -->
    <button
      type="button"
      class="ops-pull-tab"
      :title="open ? '收起' : '展开'"
      :aria-label="open ? '收起' : '展开'"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <AppIcon :name="open ? 'chevronRight' : 'chevronLeft'" :size="16" />
    </button>

    <!-- 模块书签：有可见模块即显示（面板收起时也保留，方便点开） -->
    <div
      v-if="bookmarks.length"
      class="ops-bookmark-stack"
      :style="{ top: bookmarkOffset }"
    >
      <button
        v-for="mod in bookmarks"
        :key="mod.id"
        type="button"
        class="ops-module-tab"
        :class="{ 'is-active': mod.id === activeModuleId }"
        :title="mod.label"
        @click="emit('select-module', mod.id)"
      >
        <span
          v-for="(ch, i) in [...String(mod.label)]"
          :key="`${mod.id}-${i}`"
          class="ops-module-tab-ch"
        >{{ ch }}</span>
      </button>
    </div>

    <div
      v-if="open"
      ref="hostRef"
      class="ops-side-panel-host flex min-h-0 flex-1 flex-col overflow-hidden"
    />
  </aside>
</template>

<style scoped>
.ops-pull-tab {
  position: absolute;
  top: 0.5rem;
  left: 0;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 2rem;
  margin: 0;
  padding: 0;
  transform: translateX(-100%);
  border: 1px solid var(--border, #c5d0d8);
  border-right: none;
  border-radius: 0.5rem 0 0 0.5rem;
  background: color-mix(in srgb, var(--surface, #f4f7f9) 88%, var(--ink, #1a2830));
  color: var(--muted, #5a6b75);
  cursor: pointer;
  box-shadow: -2px 1px 6px rgba(26, 40, 48, 0.12);
  transition: background 0.15s ease, color 0.15s ease;
}

.ops-pull-tab:hover {
  background: var(--surface-hover, #e8eef2);
  color: var(--ink, #1a2830);
}

.ops-bookmark-stack {
  position: absolute;
  left: 0;
  z-index: 29;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: calc(100% - 3.2rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  transform: translateX(-100%);
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.ops-bookmark-stack::-webkit-scrollbar {
  display: none;
}

.ops-module-tab {
  box-sizing: border-box;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15em;
  width: 1.9rem;
  flex-shrink: 0;
  margin: 0;
  padding: 0.65rem 0;
  border: 1px solid var(--border, #c5d0d8);
  border-right: none;
  border-radius: 0.5rem 0 0 0.5rem;
  background: color-mix(in srgb, var(--surface, #f4f7f9) 92%, var(--ink, #1a2830));
  color: var(--muted, #5a6b75);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: -2px 1px 5px rgba(26, 40, 48, 0.1);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.ops-module-tab-ch {
  display: block;
  width: 1em;
  text-align: center;
}

.ops-module-tab:hover {
  background: var(--surface-hover, #e8eef2);
  color: var(--ink, #1a2830);
}

.ops-module-tab.is-active {
  z-index: 1;
  background: var(--surface, #f4f7f9);
  color: var(--accent, #2563eb);
  border-color: var(--border, #c5d0d8);
  border-right: none;
  /* 盖住面板左边框，视觉上只剩上/下/左三边 */
  margin-right: -1px;
  padding-right: 1px;
  box-shadow: -2px 1px 5px rgba(26, 40, 48, 0.08);
}
</style>
