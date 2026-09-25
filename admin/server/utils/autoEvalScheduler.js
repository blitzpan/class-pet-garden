import { loadAutoEvalConfig } from './autoEvalConfig.js'
import { runAutoEvaluationForDate, getTzParts } from '../services/autoEvalService.js'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const FALLBACK_TIMEZONE = 'Asia/Shanghai'
const FALLBACK_RUN_AT = { hour: 20, minute: 30 }

/**
 * 距离下一次 runAt 的毫秒数；若今天该时刻已过，则顺延到明天同一时刻。
 */
export function getMsUntilNextRun(timeZone, runAt, now = Date.now()) {
  const parts = getTzParts(timeZone, new Date(now))
  const elapsedToday = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000
  const targetToday = (runAt.hour * 60 + runAt.minute) * 60 * 1000
  const delay = targetToday - elapsedToday
  return delay > 0 ? delay : delay + ONE_DAY_MS
}

/**
 * 启动自动评价（后门）定时任务：每天 runAt 时刻执行一次当天补录。
 * 配置在每次调度时重新读取，改配置无需重启；enabled=false 时到点会自动跳过。
 * @returns {Function} 停止函数（进程退出时调用）
 */
export function startAutoEvalScheduler(db) {
  let timer = null
  let running = false

  async function runOnce() {
    if (running) {
      return
    }
    running = true
    try {
      const summary = await runAutoEvaluationForDate(db)
      if (!summary.ok) {
        // 未启用/配置缺失属于预期情况，只提示不报错
        console.log(`[auto-eval] 本次未执行：${summary.error}`)
      }
    } catch (error) {
      console.error('[auto-eval] 执行失败：', error)
    } finally {
      running = false
    }
  }

  function scheduleNext() {
    const { config } = loadAutoEvalConfig()
    const timeZone = config?.timezone || FALLBACK_TIMEZONE
    const runAt = config?.runAt || FALLBACK_RUN_AT
    const delay = getMsUntilNextRun(timeZone, runAt)
    const nextRunAt = new Date(Date.now() + delay)

    if (config?.enabled) {
      console.log(`[auto-eval] 已启用，下次执行：${nextRunAt.toLocaleString('zh-CN', { timeZone })}`)
    }

    timer = setTimeout(async () => {
      await runOnce()
      scheduleNext()
    }, delay)

    // 不阻止进程退出
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  // 启动时刻已过当天 runAt（例如服务晚上才重启）时立即补跑一次，避免当天漏跑
  async function catchUpIfMissed() {
    const { config } = loadAutoEvalConfig()
    if (!config?.enabled) {
      return
    }
    const parts = getTzParts(config.timezone, new Date())
    const nowMinutes = parts.hour * 60 + parts.minute
    const runMinutes = config.runAt.hour * 60 + config.runAt.minute
    if (nowMinutes >= runMinutes) {
      console.log('[auto-eval] 今天的执行时刻已过，启动后立即补跑一次')
      await runOnce()
    }
  }

  // 启动时明确打印配置加载结果，方便运维确认"到底读到哪份配置、有没有生效"
  const { config, filePath, error, warnings } = loadAutoEvalConfig()
  if (error) {
    console.warn(`[auto-eval] 配置不可用（${filePath}）：${error}`)
  } else if (!config) {
    console.log('[auto-eval] 未找到配置文件（config/autoEval.json 或 AUTO_EVAL_CONFIG），功能未启用')
  } else if (!config.enabled) {
    console.log(`[auto-eval] 已读取配置 ${filePath}，enabled=false，不启用`)
  } else {
    console.log(`[auto-eval] 已读取配置 ${filePath}，已启用，班级 ${config.classes.length} 个`)
  }
  if (warnings && warnings.length > 0) {
    console.warn(`[auto-eval] 配置告警：${warnings.join('；')}`)
  }

  scheduleNext()
  catchUpIfMissed().catch((error) => {
    console.error('[auto-eval] 启动补跑失败：', error)
  })

  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}
