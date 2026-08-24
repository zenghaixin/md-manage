/**
 * 数字快捷键气泡：通用宿主（内容 + 回调），与具体扩展无关。
 * 全应用共用单例，避免多实例叠气泡 / 重复键盘监听。
 */
export { KEY_PICKER_CLASS } from './constants'
export { KEY_PICKER_STYLES, ensureKeyPickerStyles } from './styles'
export { KeyPicker } from './KeyPicker'
export type {
  KeyPickerAnchor,
  KeyPickerSecondary,
  KeyPickerItem,
  KeyPickerShowOptions,
} from './KeyPicker'

import { KeyPicker } from './KeyPicker'

let sharedPicker: KeyPicker | null = null

/** 全应用唯一的 KeyPicker 实例 */
export function getKeyPicker(): KeyPicker {
  if (!sharedPicker) sharedPicker = new KeyPicker()
  return sharedPicker
}

/** 测试或热重载时重置（一般业务勿调） */
export function resetKeyPicker(): void {
  sharedPicker?.destroy()
  sharedPicker = null
}
