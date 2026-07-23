/**
 * 释放被占用的开发端口，避免旧 API 进程导致 npm run dev 立刻退出。
 * 用法: node scripts/free-port.js 3001
 */
import { execSync } from 'child_process'

const port = Number(process.argv[2] || 3001)
if (!Number.isFinite(port) || port <= 0) {
  console.error('[free-port] 无效端口')
  process.exit(1)
}

function pidsOnPort(p) {
  try {
    const out = execSync(`netstat -ano`, { encoding: 'utf8' })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${p}`) || !line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      if (pid > 0) pids.add(pid)
    }
    return [...pids]
  } catch {
    return []
  }
}

const pids = pidsOnPort(port)
if (!pids.length) {
  process.exit(0)
}

for (const pid of pids) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
    console.log(`[free-port] 已结束占用 ${port} 的进程 PID=${pid}`)
  } catch {
    console.warn(`[free-port] 无法结束 PID=${pid}，若 npm run dev 失败请手动 taskkill`)
  }
}
