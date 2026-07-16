import { ElMessage } from 'element-plus'

export function useToast() {
  function showToast(msg, type = 'info') {
    if (!msg) return
    ElMessage({
      message: msg,
      type,
      duration: 2600,
      showClose: false,
    })
  }

  return { showToast }
}
