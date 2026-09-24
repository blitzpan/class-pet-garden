import { cleanExpiredCards } from '../routes/shareCard.js'

let timer = null

export function startShareCardCleaner(intervalMs = 60 * 60 * 1000) {
  if (timer) return

  // 启动时先跑一次
  cleanExpiredCards()

  // 每小时兜底清理一次
  timer = setInterval(() => {
    cleanExpiredCards()
  }, intervalMs)

  timer.unref() // 不阻塞进程退出
  console.log('🧹 分享卡自动清理已启动（每小时执行）')
}

export function stopShareCardCleaner() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}