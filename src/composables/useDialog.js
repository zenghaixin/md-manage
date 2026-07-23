/**
 * 统一对话框：基于 Element Plus MessageBox，与 DocsPage 风格一致。
 */
import { ElMessage, ElMessageBox } from 'element-plus'

/**
 * 确认框。确定 → true，取消/关闭 → false。
 */
export async function confirmAction(
  message,
  title = '确认',
  options = {},
) {
  try {
    await ElMessageBox.confirm(String(message ?? ''), title, {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      draggable: true,
      ...options,
    })
    return true
  } catch {
    return false
  }
}

/**
 * 二选一（关闭 X 视为放弃）。
 * @returns {'confirm' | 'cancel' | 'close'}
 */
export async function confirmChoice(
  message,
  title = '请选择',
  {
    confirmText = '确定',
    cancelText = '取消',
    type = 'info',
    ...rest
  } = {},
) {
  try {
    await ElMessageBox.confirm(String(message ?? ''), title, {
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      distinguishCancelAndClose: true,
      type,
      draggable: true,
      ...rest,
    })
    return 'confirm'
  } catch (action) {
    if (action === 'cancel') return 'cancel'
    return 'close'
  }
}

/** 错误提示（模态） */
export async function alertError(message, title = '出错了') {
  try {
    await ElMessageBox.alert(String(message ?? '未知错误'), title, {
      confirmButtonText: '知道了',
      type: 'error',
      draggable: true,
    })
  } catch {
    // 关闭即可
  }
}

/** 普通提示（模态） */
export async function alertInfo(message, title = '提示') {
  try {
    await ElMessageBox.alert(String(message ?? ''), title, {
      confirmButtonText: '知道了',
      type: 'info',
      draggable: true,
    })
  } catch {
    // ignore
  }
}

/** 轻量 Toast（非阻塞） */
export function toast(message, type = 'info') {
  if (!message) return
  ElMessage({
    message: String(message),
    type,
    duration: 2600,
    showClose: false,
  })
}
