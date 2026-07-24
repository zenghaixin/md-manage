/**
 * 应用图标映射（Iconify / Icônes）
 *
 * 在 https://icones.js.org/ 搜索图标后，复制名称（如 lucide:folder）
 * 改到这里即可，无需改各组件。
 *
 * 也可在 <AppIcon> 上直接传 icon="集合:名称" 临时覆盖。
 */
export const icons = {
  settings: 'lucide:settings',
  sidebarFold: 'lucide:panel-left-close',
  sidebarExpand: 'lucide:panel-left-open',
  edit: 'lucide:pencil',
  source: 'lucide:code-xml',
  folder: 'lucide:folder',
  folderOpen: 'lucide:folder-open',
  folderPlus: 'line-md:folder-plus',
  filePlus: 'line-md:file-plus',
  file: 'lucide:file-text',
  chevronRight: 'lucide:chevron-right',
  close: 'lucide:x',
  plus: 'lucide:plus',
}

/** @typedef {keyof typeof icons} AppIconName */
