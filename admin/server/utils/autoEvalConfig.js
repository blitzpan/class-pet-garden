import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const DEFAULT_RUN_AT = '20:30'

/**
 * 默认参数。配置文件里没写的字段全部走这里。
 * 班级级配置可覆盖 defaults，学生级配置可再覆盖班级级。
 */
const PARAM_DEFAULTS = {
  dailyMin: 2, // 每日净增下限（可为负，负数表示当天允许净扣分）
  dailyMax: 8, // 每日净增上限
  gapToTop: 2, // 与真实第一名的安全差距：总分天花板 = 真实第一名总分 - gapToTop（最小 1，同分按宠物等级排序仍可能判第一）
  maxDailyDrop: 4, // 触顶后单日最大回落幅度，避免"一天暴跌"露馅
  weekendFactor: 0.5, // 周末区间缩放系数（区间上下限与条数都会乘它）
  recordsPerDay: [2, 4], // 平日记录条数区间
  weekendRecordsPerDay: [1, 2], // 周末记录条数区间
  negativeChance: 0.3, // 当天安排 1 条扣分记录的概率，让曲线更真实
}

/** 参数白名单：只有这些键会被识别，其余键忽略（便于写 `_说明` 之类的注释字段） */
const PARAM_KEYS = Object.keys(PARAM_DEFAULTS)

function toInt(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

/** 解析 [min, max] 形式的区间，也允许写成单个数字 */
function toRange(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    const min = toInt(value[0], fallback[0])
    const max = toInt(value[1], fallback[1])
    return [Math.min(min, max), Math.max(min, max)]
  }
  if (value !== undefined && value !== null) {
    const single = toInt(value, fallback[0])
    return [Math.min(single, fallback[1]), Math.max(single, fallback[1])]
  }
  return [...fallback]
}

/** 从原始配置里挑出合法的参数键，与 base 合并 */
function mergeParams(base, raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...base }
  }

  const merged = { ...base }

  if (raw.dailyMin !== undefined) merged.dailyMin = toInt(raw.dailyMin, base.dailyMin)
  if (raw.dailyMax !== undefined) merged.dailyMax = toInt(raw.dailyMax, base.dailyMax)
  // 区间写反了就纠正，避免算出空区间
  if (merged.dailyMin > merged.dailyMax) {
    const min = merged.dailyMin
    merged.dailyMin = merged.dailyMax
    merged.dailyMax = min
  }

  // 至少留 1 分：排名在总分相同时按 pet_level 降序，差距为 0 时仍可能被判成第一名
  if (raw.gapToTop !== undefined) merged.gapToTop = Math.max(1, toInt(raw.gapToTop, base.gapToTop))
  if (raw.maxDailyDrop !== undefined) merged.maxDailyDrop = Math.max(1, toInt(raw.maxDailyDrop, base.maxDailyDrop))
  if (raw.weekendFactor !== undefined) {
    merged.weekendFactor = Math.min(1, Math.max(0, toNumber(raw.weekendFactor, base.weekendFactor)))
  }
  if (raw.recordsPerDay !== undefined) merged.recordsPerDay = toRange(raw.recordsPerDay, base.recordsPerDay)
  if (raw.weekendRecordsPerDay !== undefined) {
    merged.weekendRecordsPerDay = toRange(raw.weekendRecordsPerDay, base.weekendRecordsPerDay)
  }
  if (raw.negativeChance !== undefined) {
    merged.negativeChance = Math.min(1, Math.max(0, toNumber(raw.negativeChance, base.negativeChance)))
  }

  return merged
}

/** 解析 "HH:MM" 为 { hour, minute } */
function parseRunAt(value) {
  const text = String(value || DEFAULT_RUN_AT).trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return { hour, minute }
}

/** 校验时区是否可用（写错时区会让定时和日期判断全部错位） */
function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch (e) {
    return false
  }
}

/**
 * 查找配置文件，顺序：
 * 1）环境变量 AUTO_EVAL_CONFIG 指定的绝对路径（优先级最高，最不容易踩坑）
 * 2）<server>/../config/autoEval.json：容器里配置目录挂在代码上一级（如 /app/config）
 * 3）<server>/config/autoEval.json：随代码发布的默认位置（本地开发与单目录部署）
 *
 * 注意：挂载目录必须排在随代码发布的目录之前。否则镜像里自带的那份（enabled=false）
 * 会先被命中，运维放到挂载目录的配置将永远不生效。
 */
export function resolveConfigPath() {
  // 本文件位于 <server>/utils/ 下，需先回到 server 根目录再找 config
  const serverRoot = path.resolve(__dirname, '..')

  const candidates = []
  if (process.env.AUTO_EVAL_CONFIG) {
    candidates.push(process.env.AUTO_EVAL_CONFIG)
  }
  // 容器里配置目录通常挂在代码上一级（/app/server → /app/config）
  candidates.push(path.join(serverRoot, '..', 'config', 'autoEval.json'))
  // 随代码发布的位置（本地开发）
  candidates.push(path.join(serverRoot, 'config', 'autoEval.json'))

  for (const filePath of candidates) {
    try {
      if (fs.statSync(filePath).isFile()) {
        return filePath
      }
    } catch (e) {
      // 文件不存在，继续找下一个候选
    }
  }
  return null
}

/** 归一化整份配置；返回 { config, warnings }，config 为 null 表示不可用 */
function normalizeConfig(raw) {
  const warnings = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: null, warnings: ['配置内容不是合法的对象'] }
  }

  const enabled = raw.enabled === true || raw.enabled === 'true'
  let timeZone = String(raw.timezone || DEFAULT_TIMEZONE)
  if (!isValidTimeZone(timeZone)) {
    warnings.push(`时区无效：${timeZone}，已回退为 ${DEFAULT_TIMEZONE}`)
    timeZone = DEFAULT_TIMEZONE
  }

  const runAt = parseRunAt(raw.runAt)
  if (!runAt) {
    warnings.push(`runAt 无效：${raw.runAt}，已回退为 ${DEFAULT_RUN_AT}`)
  }

  const defaults = mergeParams(PARAM_DEFAULTS, raw.defaults)

  const classes = []
  if (!Array.isArray(raw.classes)) {
    warnings.push('classes 缺失或不是数组，没有可执行的班级')
  } else {
    raw.classes.forEach((classRaw, classIndex) => {
      if (!classRaw || typeof classRaw !== 'object') {
        warnings.push(`classes[${classIndex}] 不是对象，已跳过`)
        return
      }
      const classId = typeof classRaw.classId === 'string' ? classRaw.classId.trim() : ''
      const className = typeof classRaw.className === 'string' ? classRaw.className.trim() : ''
      if (!classId && !className) {
        warnings.push(`classes[${classIndex}] 缺少 classId/className，已跳过`)
        return
      }
      if (!Array.isArray(classRaw.students) || classRaw.students.length === 0) {
        warnings.push(`classes[${classIndex}]（${classId || className}）没有配置学生，已跳过`)
        return
      }

      const classParams = mergeParams(defaults, classRaw)

      const students = []
      classRaw.students.forEach((studentRaw, studentIndex) => {
        if (!studentRaw || typeof studentRaw !== 'object') {
          warnings.push(`classes[${classIndex}].students[${studentIndex}] 不是对象，已跳过`)
          return
        }
        const id = typeof studentRaw.id === 'string' ? studentRaw.id.trim() : ''
        const name = typeof studentRaw.name === 'string' ? studentRaw.name.trim() : ''
        if (!id && !name) {
          warnings.push(`classes[${classIndex}].students[${studentIndex}] 缺少 id/name，已跳过`)
          return
        }
        // 学生级参数覆盖班级级参数
        students.push({
          id: id || null,
          name: name || null,
          params: mergeParams(classParams, studentRaw),
        })
      })

      if (students.length === 0) {
        return
      }
      classes.push({ classId: classId || null, className: className || null, students })
    })
  }

  const config = {
    enabled,
    timezone: timeZone,
    runAt: runAt || parseRunAt(DEFAULT_RUN_AT),
    defaults,
    classes,
  }

  return { config, warnings }
}

/**
 * 读取并校验配置文件。每次调用都重新读盘，改完配置下一次执行即生效。
 * @returns {{ config: object|null, filePath: string|null, error: string|null, warnings: string[] }}
 */
export function loadAutoEvalConfig() {
  const filePath = resolveConfigPath()
  if (!filePath) {
    // 没有配置文件属于正常情况：功能未启用，不打扰日志
    return { config: null, filePath: null, error: null, warnings: [] }
  }

  let raw
  try {
    // 去掉 BOM：Windows 记事本 / PowerShell 另存的 UTF-8 会带 BOM，不处理会解析失败
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (e) {
    return { config: null, filePath, error: `配置文件解析失败：${e.message}`, warnings: [] }
  }

  const { config, warnings } = normalizeConfig(raw)
  return {
    config,
    filePath,
    error: config ? null : '配置校验失败',
    warnings,
  }
}

export { PARAM_DEFAULTS, PARAM_KEYS }
