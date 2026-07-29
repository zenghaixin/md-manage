/**
 * Ctrl+Alt+T：选词条类型。
 * 使用编辑器通用 KeyPicker（内容 + 回调）。
 */
import { beginUiGestureLock } from '../../../shellEvents'
import { KeyPicker } from '../../../components/key-picker'
import { TERM_GLOSSARY_ID } from './constants'
import {
  TERM_TYPE_BASIC,
  TERM_TYPE_SPECIALS,
  type TermTypeId,
} from './termTypes'

export type TermTypePickResult =
  | { ok: true; type: TermTypeId }
  | { ok: false }

const picker = new KeyPicker()

export function closeTermTypePicker() {
  picker.hide()
}

/**
 * @param anchor 视口坐标（一般取光标 coords）
 * @returns 选中的类型；取消则为 ok:false
 */
export function openTermTypePicker(anchor: {
  left: number
  top: number
  bottom?: number
  right?: number
}): Promise<TermTypePickResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: TermTypePickResult) => {
      if (settled) return
      settled = true
      picker.hide()
      resolve(result)
    }

    beginUiGestureLock(400)
    picker.show({
      anchor: {
        left: anchor.left,
        top: anchor.top,
        bottom: anchor.bottom ?? anchor.top,
        right: anchor.right ?? anchor.left,
      },
      items: TERM_TYPE_SPECIALS.map((t) => ({
        label: t.label,
        value: t.id,
        quoted: false,
      })),
      onPick: (value) => {
        finish({ ok: true, type: value as TermTypeId })
      },
      esc: {
        label: '普通词条',
        onSelect: () => finish({ ok: true, type: TERM_TYPE_BASIC }),
      },
      onDismiss: () => finish({ ok: false }),
      dismissOnOutside: true,
      enterAsEsc: true,
      sourceId: TERM_GLOSSARY_ID,
    })
  })
}
