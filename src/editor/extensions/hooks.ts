/**
 * 扩展生命周期钩子运行器。
 * 核心壳只调用这里，不直接依赖具体扩展实现。
 */
import type { FileContext, MarkdownExtension } from './types'
import { getAllExtensions } from './registry'

async function runHook(
  name: 'onAppStart' | 'onFileSave',
  invoke: (ext: MarkdownExtension) => unknown,
): Promise<void> {
  const tasks = getAllExtensions().map(async (ext) => {
    try {
      await invoke(ext)
    } catch (err) {
      console.warn(`[extensions] ${ext.id}.${name} failed:`, err)
    }
  })
  await Promise.all(tasks)
}

/** 应用启动：并行执行各扩展 onAppStart */
export async function runAppStartHooks(): Promise<void> {
  await runHook('onAppStart', (ext) => ext.onAppStart?.())
}

/** 文件落盘成功后：通知各扩展 */
export async function runFileSaveHooks(ctx: FileContext): Promise<void> {
  if (!ctx?.tab || !ctx?.file) return
  await runHook('onFileSave', (ext) => ext.onFileSave?.(ctx))
}
