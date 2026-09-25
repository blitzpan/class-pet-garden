import { v4 as uuidv4 } from 'uuid'
import { applyEvaluation } from './evaluationService.js'
import { loadAutoEvalConfig } from '../utils/autoEvalConfig.js'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const MIN_GAP_MS = 20 * MINUTE_MS // 同一天相邻两条记录的最小间隔，避免"刷分"观感
const PREFERRED_MAX_ABS = 3 // 优先使用的单条分值上限（真实老师多为 1~3 分）
const FAMILY_CATEGORY = '家庭' // 周末以家庭类项目为主，避免"周末还在上课"

// 可信时段（本地时间，距零点的分钟数）
const WEEKDAY_WINDOWS = [
  [8 * 60, 11 * 60 + 30], // 上午上课
  [13 * 60 + 30, 16 * 60 + 30], // 下午上课
  [19 * 60, 20 * 60 + 30], // 晚间家庭时段
]
const WEEKEND_WINDOWS = [
  [9 * 60 + 30, 11 * 60 + 30],
  [15 * 60, 17 * 60 + 30],
  [19 * 60, 20 * 60 + 30],
]

function randInt(min, max) {
  const low = Math.ceil(Math.min(min, max))
  const high = Math.floor(Math.max(min, max))
  return Math.floor(low + Math.random() * (high - low + 1))
}

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)]
}

/* ----------------------------- 时区与日期工具 ----------------------------- */

/** 取指定时区下的年/月/日/时/分/秒（供定时任务与日期判断复用） */
export function getTzParts(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const map = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24, // 部分环境 hour12:false 会给出 24
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/** 指定时区在某一时刻的偏移（毫秒） */
function getTzOffsetMs(timeZone, utcMs) {
  const parts = getTzParts(timeZone, new Date(utcMs))
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** 指定时区某一天零点的 UTC 时间戳 */
function localMidnightUtcMs(timeZone, year, month, day) {
  // 取当天中午求偏移，避开夏令时切换时刻带来的误差
  const offset = getTzOffsetMs(timeZone, Date.UTC(year, month - 1, day, 12))
  return Date.UTC(year, month - 1, day, 0, 0, 0) - offset
}

/** 取指定时区下的今天（YYYY-MM-DD） */
function getTodayDateString(timeZone, now = Date.now()) {
  const parts = getTzParts(timeZone, new Date(now))
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function parseEvalDate(evalDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(evalDate || ''))
  if (!match) {
    return null
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function isWeekendDate({ year, month, day }) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/* ------------------------------- 时间戳回填 ------------------------------- */

/**
 * 在当天可信时段内取 count 个互不相同的时刻（升序）。
 * 约束：不能晚于 nowMs（绝不产生未来时间），相邻间隔 ≥ MIN_GAP_MS。
 */
function buildTimestamps({ timeZone, date, count, nowMs, isWeekend }) {
  const midnight = localMidnightUtcMs(timeZone, date.year, date.month, date.day)
  const windows = isWeekend ? WEEKEND_WINDOWS : WEEKDAY_WINDOWS
  const dayEnd = midnight + 24 * HOUR_MS - 1
  const upper = Math.min(nowMs, dayEnd)

  // 只保留已经开始且还有余量的时段
  let ranges = windows
    .map(([start, end]) => [midnight + start * MINUTE_MS, midnight + end * MINUTE_MS])
    .filter(([start]) => start <= upper)
    .map(([start, end]) => [start, Math.min(end, upper)])
    .filter(([start, end]) => end - start >= MINUTE_MS)

  // 时段都还没到（例如凌晨手动触发）：退化为"当天 08:00 ~ 现在"
  if (ranges.length === 0) {
    const start = midnight + 8 * HOUR_MS
    if (upper - start < MINUTE_MS) {
      return []
    }
    ranges = [[start, upper]]
  }

  const totalLength = ranges.reduce((sum, [start, end]) => sum + (end - start), 0)

  //  rejection 采样：抽到满足最小间隔的一组时刻就用
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const times = []
    for (let i = 0; i < count; i += 1) {
      let offset = Math.random() * totalLength
      for (const [start, end] of ranges) {
        const length = end - start
        if (offset < length) {
          times.push(start + offset)
          break
        }
        offset -= length
      }
    }
    if (times.length !== count) {
      continue
    }
    times.sort((a, b) => a - b)
    let ok = true
    for (let i = 1; i < times.length; i += 1) {
      if (times[i] - times[i - 1] < MIN_GAP_MS) {
        ok = false
        break
      }
    }
    if (ok) {
      return times.map((time) => Math.round(time))
    }
  }

  // 兜底：在最大时段里等距铺开并加随机抖动
  const [start, end] = ranges.reduce(
    (best, range) => (range[1] - range[0] > best[1] - best[0] ? range : best),
    ranges[0],
  )
  const step = (end - start) / (count + 1)
  const jitter = Math.min(step * 0.4, 30 * MINUTE_MS)
  const times = []
  for (let i = 0; i < count; i += 1) {
    times.push(Math.round(start + step * (i + 1) + (Math.random() - 0.5) * jitter))
  }
  return times.sort((a, b) => a - b)
}

/* -------------------------------- 规则拆解 -------------------------------- */

/**
 * 修正方向与幅度：净增不得超过 delta；加分日不能变成净扣分，扣分日不得跌破 delta。
 */
function trimToDelta(items, delta) {
  const result = [...items]
  const sum = () => result.reduce((acc, item) => acc + item.points, 0)

  // 加分日若被扣分条目拖成净扣分，先去掉扣分条目
  while (delta > 0 && sum() <= 0 && result.length > 1) {
    const index = result.findIndex((item) => item.points < 0)
    if (index === -1) {
      break
    }
    result.splice(index, 1)
  }

  // 幅度超标时去掉绝对值最大的条目，至少保留 1 条
  while (result.length > 1) {
    const net = sum()
    const over = delta > 0 ? net > delta : net < delta
    if (!over) {
      break
    }
    let index = 0
    for (let i = 1; i < result.length; i += 1) {
      if (Math.abs(result[i].points) > Math.abs(result[index].points)) {
        index = i
      }
    }
    result.splice(index, 1)
  }

  return result
}

/**
 * 把当天净增 delta 拆成若干条真实规则记录，尽量精确凑出 delta。
 * 只挑班级可见的规则（全局规则 + 该班教师的自定义规则），同日不重复同一理由，
 * 优先 1~3 分的小分值，并按概率掺 1 条扣分，让波动像真人操作。
 */
function pickRecordRules({ pool, delta, params, isWeekend }) {
  const sign = delta > 0 ? 1 : -1
  const sameSign = pool.filter((rule) => Math.sign(rule.points) === sign)
  if (sameSign.length === 0) {
    return []
  }

  // 周末只用家庭类（班级没有家庭类规则时退回全部）
  let candidates = sameSign
  if (isWeekend) {
    const family = sameSign.filter((rule) => rule.category === FAMILY_CATEGORY)
    if (family.length > 0) {
      candidates = family
    }
  }

  // 可用的分值档位（绝对值升序）；单条优先不超过 3 分
  const values = [...new Set(candidates.map((rule) => Math.abs(rule.points)))].sort((a, b) => a - b)
  const maxPart = Math.min(PREFERRED_MAX_ABS, values[values.length - 1])

  const recordRange = isWeekend ? params.weekendRecordsPerDay : params.recordsPerDay
  const desiredCount = Math.max(1, randInt(recordRange[0], recordRange[1]))

  const items = []
  const usedNames = new Set()
  let target = Math.abs(delta)

  // 加分日按概率掺 1 条扣分（-1/-2），加分部分要把它补回来。
  // 只有当剩余条数仍凑得满目标时才掺，否则净增方向会失真。
  if (sign > 0 && desiredCount >= 3 && Math.random() < params.negativeChance) {
    const negativePool = pool.filter((rule) => rule.points < 0 && Math.abs(rule.points) <= 2)
    if (negativePool.length > 0) {
      const rule = pickOne(negativePool)
      if (Math.ceil((target + Math.abs(rule.points)) / maxPart) <= desiredCount - 1) {
        items.push(rule)
        usedNames.add(rule.name)
        target += Math.abs(rule.points)
      }
    }
  }

  // 主条目条数：加分日按配置区间，扣分日只写 1~2 条（一天连扣好几次太扎眼）
  const budget = sign > 0 ? Math.max(1, desiredCount - items.length) : Math.min(recordRange[1], 2)
  const needed = Math.ceil(target / maxPart) // 凑满 target 至少需要几条
  const slots = Math.max(1, Math.min(Math.max(needed, recordRange[0]), budget, target))

  let remaining = target
  let picked = 0
  while (picked < slots && remaining > 0) {
    const slotsLeft = slots - picked - 1
    // 本条取值的上下界：上界给后面每条各留 1 分，下界保证后面每条即使取满也能凑到目标，
    // 否则会出现"随机挑了偏小的分值、最终凑不满"而低于配置的每日下限
    const maxForThis = Math.min(maxPart, remaining - slotsLeft)
    const minForThis = Math.max(1, remaining - slotsLeft * maxPart)
    let usable = candidates.filter(
      (rule) =>
        !usedNames.has(rule.name) &&
        Math.abs(rule.points) >= minForThis &&
        Math.abs(rule.points) <= maxForThis,
    )
    if (usable.length === 0) {
      // 档位上没有可用规则时退而求其次：取不超过上界的最大档，允许略微偏低
      usable = candidates.filter((rule) => !usedNames.has(rule.name) && Math.abs(rule.points) <= maxForThis)
    }
    if (usable.length === 0) {
      break
    }
    const rule = pickOne(usable)
    items.push(rule)
    usedNames.add(rule.name)
    remaining -= Math.abs(rule.points)
    picked += 1
  }

  // 兜底：规则池太小一条都没凑出来时，至少写一条不超过目标分值的记录
  if (items.length === 0) {
    const fallback = candidates.filter((rule) => Math.abs(rule.points) <= target)
    items.push(fallback.length > 0 ? pickOne(fallback) : pickOne(candidates))
  }

  return trimToDelta(items, delta)
}

/* -------------------------------- 目标解析 -------------------------------- */

async function resolveClass(db, classRaw) {
  if (classRaw.classId) {
    return await db.prepare('SELECT id, name, user_id FROM classes WHERE id = ?').get(classRaw.classId)
  }
  const rows = await db
    .prepare('SELECT id, name, user_id FROM classes WHERE name = ? ORDER BY created_at DESC')
    .all(classRaw.className)
  return rows[0] || null
}

/**
 * 把配置里的班级/学生解析成可执行的列表。
 * @returns {Promise<{ targets: Array, warnings: string[] }>}
 */
async function resolveAutoEvalTargets(db, config) {
  const targets = []
  const warnings = []

  for (const classRaw of config.classes) {
    const cls = await resolveClass(db, classRaw)
    if (!cls) {
      warnings.push(`找不到班级：${classRaw.classId || classRaw.className}`)
      continue
    }

    for (const studentRaw of classRaw.students) {
      let student
      if (studentRaw.id) {
        student = await db
          .prepare('SELECT id, name FROM students WHERE id = ? AND class_id = ?')
          .get(studentRaw.id, cls.id)
      } else {
        student = await db
          .prepare('SELECT id, name FROM students WHERE class_id = ? AND name = ? LIMIT 1')
          .get(cls.id, studentRaw.name)
      }
      if (!student) {
        warnings.push(`${cls.name}：找不到学生 ${studentRaw.id || studentRaw.name}`)
        continue
      }
      targets.push({
        classId: cls.id,
        className: cls.name,
        ownerUserId: cls.user_id,
        studentId: student.id,
        studentName: student.name,
        params: studentRaw.params,
      })
    }
  }

  return { targets, warnings }
}

/* --------------------------------- 落库执行 --------------------------------- */

async function writeLog(db, { classId, studentId, evalDate, delta, count, skipped, reason, now }) {
  await db
    .prepare(
      `INSERT INTO auto_eval_log
        (id, class_id, student_id, eval_date, points_delta, record_count, skipped, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(uuidv4(), classId, studentId, evalDate, delta, count, skipped ? 1 : 0, reason || null, now)
}

/**
 * 为单个学生执行某一天的自动评价。
 * @returns {Promise<object>} { studentId, studentName, skipped, reason?, delta, records, topPoints, cap, currentBefore }
 */
export async function runAutoEvaluationForStudent(db, options) {
  const { classId, className, studentId, studentName, params, evalDate, now, timeZone, pool, backdoorIds } = options

  // 幂等：同一天只执行一次
  const existing = await db
    .prepare('SELECT id FROM auto_eval_log WHERE student_id = ? AND eval_date = ?')
    .get(studentId, evalDate)
  if (existing) {
    return { studentId, studentName, className, skipped: true, reason: '当天已执行过（幂等跳过）' }
  }

  const student = await db
    .prepare('SELECT id, total_points FROM students WHERE id = ? AND class_id = ?')
    .get(studentId, classId)
  if (!student) {
    return { studentId, studentName, className, skipped: true, reason: '学生不存在或不在该班级' }
  }

  // 真实第一名：排除全部后门学生，否则几个后门学生会互相抬天花板、一起冲顶
  const excluded = backdoorIds.filter((id) => id !== studentId)
  const placeholders = excluded.map(() => '?').join(',')
  const topRow = await db
    .prepare(
      `SELECT MAX(total_points) AS top_points FROM students WHERE class_id = ? AND id <> ?${
        placeholders ? ` AND id NOT IN (${placeholders})` : ''
      }`,
    )
    .get(classId, studentId, ...excluded)
  const topPoints = topRow?.top_points
  if (topPoints === null || topPoints === undefined) {
    return { studentId, studentName, className, skipped: true, reason: '班级内没有可用于对标的真实学生' }
  }

  const date = parseEvalDate(evalDate)
  if (!date) {
    return { studentId, studentName, className, skipped: true, reason: `日期格式非法：${evalDate}` }
  }
  const weekend = isWeekendDate(date)

  // 天花板与当日区间
  const cap = topPoints - params.gapToTop
  const current = student.total_points

  // 真实第一名分数过低（例如新班级还没人得分）时天花板为负，
  // 这时不存在有意义的"第二名"，直接跳过，避免后门学生被一路扣成负分
  if (cap <= 0) {
    await writeLog(db, {
      classId,
      studentId,
      evalDate,
      delta: 0,
      count: 0,
      skipped: true,
      reason: '真实第一名分数过低，暂无追赶目标',
      now,
    })
    return { studentId, studentName, className, skipped: true, reason: '真实第一名分数过低，暂无追赶目标', topPoints, cap, currentBefore: current }
  }

  const headroom = cap - current
  const factor = weekend ? params.weekendFactor : 1
  const lo = Math.round(params.dailyMin * factor)
  const hi = Math.round(params.dailyMax * factor)

  let delta
  if (headroom > 0) {
    // 还有空间：在区间内随机，但不得超过剩余空间
    const upper = Math.min(hi, headroom)
    const lower = Math.min(lo, upper)
    delta = randInt(lower, upper)
  } else {
    // 已贴顶或超过：必须回落，至少 -1，单日跌幅不超过 maxDailyDrop
    delta = Math.min(-1, Math.max(headroom, -params.maxDailyDrop))
  }

  if (delta === 0) {
    await writeLog(db, {
      classId,
      studentId,
      evalDate,
      delta: 0,
      count: 0,
      skipped: true,
      reason: '天花板剩余空间为 0，本日不加分',
      now,
    })
    return { studentId, studentName, className, skipped: true, reason: '本日无需加减分（净增为 0）', delta: 0, topPoints, cap, currentBefore: current }
  }

  const rules = pickRecordRules({ pool, delta, params, isWeekend: weekend })
  if (rules.length === 0) {
    await writeLog(db, {
      classId,
      studentId,
      evalDate,
      delta: 0,
      count: 0,
      skipped: true,
      reason: '没有可用的评价规则',
      now,
    })
    return { studentId, studentName, className, skipped: true, reason: '没有可用的评价规则', delta, topPoints, cap, currentBefore: current }
  }

  const timestamps = buildTimestamps({ timeZone, date, count: rules.length, nowMs: now, isWeekend: weekend })
  if (timestamps.length === 0) {
    await writeLog(db, {
      classId,
      studentId,
      evalDate,
      delta: 0,
      count: 0,
      skipped: true,
      reason: '当天没有可用的回填时段',
      now,
    })
    return { studentId, studentName, className, skipped: true, reason: '当天没有可用的回填时段（可能触发过早）', delta, topPoints, cap, currentBefore: current }
  }

  // 时刻不足时截断规则条数，并按时间升序落库
  let plan = rules.slice(0, timestamps.length).map((rule, index) => ({ rule, timestamp: timestamps[index] }))

  // 截断后可能出现"本该加分却成了净扣分"，此时去掉扣分条目保证方向正确
  let net = plan.reduce((sum, item) => sum + item.rule.points, 0)
  if (delta > 0 && net <= 0) {
    plan = plan.filter((item) => item.rule.points > 0)
    net = plan.reduce((sum, item) => sum + item.rule.points, 0)
  }
  if (plan.length === 0) {
    await writeLog(db, {
      classId,
      studentId,
      evalDate,
      delta: 0,
      count: 0,
      skipped: true,
      reason: '拆解后没有可写入的记录',
      now,
    })
    return { studentId, studentName, className, skipped: true, reason: '拆解后没有可写入的记录', delta, topPoints, cap, currentBefore: current }
  }

  plan.sort((a, b) => a.timestamp - b.timestamp)

  // 事务内先占位写日志再落评价：UNIQUE(student_id, eval_date) 冲突会整体回滚，
  // 这样并发触发（定时任务与手动触发撞在一起）时不会写出两份评价记录
  const logId = uuidv4()
  const created = []
  await db.transaction(async () => {
    await db
      .prepare(
        `INSERT INTO auto_eval_log
          (id, class_id, student_id, eval_date, points_delta, record_count, skipped, reason, created_at)
         VALUES (?, ?, ?, ?, 0, 0, 1, '执行中', ?)`,
      )
      .run(logId, classId, studentId, evalDate, now)

    for (const item of plan) {
      const result = await applyEvaluation(db, {
        classId,
        studentId,
        points: item.rule.points,
        reason: item.rule.name,
        category: item.rule.category,
        timestamp: item.timestamp,
      })
      created.push({
        id: result.id,
        points: item.rule.points,
        reason: item.rule.name,
        category: item.rule.category,
        timestamp: item.timestamp,
      })
    }

    net = created.reduce((sum, item) => sum + item.points, 0)
    await db
      .prepare('UPDATE auto_eval_log SET points_delta = ?, record_count = ?, skipped = 0, reason = NULL WHERE id = ?')
      .run(net, created.length, logId)
  })()

  return {
    studentId,
    studentName,
    className,
    skipped: false,
    delta: net,
    records: created,
    topPoints,
    cap,
    currentBefore: current,
    currentAfter: current + net,
  }
}

/* --------------------------------- 批量入口 --------------------------------- */

/**
 * 执行某一天的全部自动评价（调度器与手动触发共用）。
 * @param {object} [options.config] 已加载的配置；不传则每次从磁盘重新读取（改配置即生效）
 */
// 进程内互斥：定时任务与手动触发可能撞在同一时刻，串行执行避免相互干扰
let batchRunning = false

export async function runAutoEvaluationForDate(db, options = {}) {
  const { evalDate, now = Date.now(), config: presetConfig, verbose = true } = options

  if (batchRunning) {
    return { ok: false, error: '上一次执行尚未结束，本次已跳过', evalDate: evalDate || null, warnings: [], results: [] }
  }
  batchRunning = true

  try {
    return await runAutoEvaluationForDateInternal(db, { evalDate, now, presetConfig, verbose })
  } finally {
    batchRunning = false
  }
}

async function runAutoEvaluationForDateInternal(db, { evalDate, now, presetConfig, verbose }) {
  const loaded = presetConfig
    ? { config: presetConfig, filePath: null, error: null, warnings: [] }
    : loadAutoEvalConfig()

  const warnings = [...(loaded.warnings || [])]
  if (loaded.error) {
    return { ok: false, error: loaded.error, evalDate: evalDate || null, warnings, results: [] }
  }
  if (!loaded.config) {
    return {
      ok: false,
      error: '未找到配置文件（server/config/autoEval.json 或 AUTO_EVAL_CONFIG）',
      evalDate: evalDate || null,
      warnings,
      results: [],
    }
  }
  if (!loaded.config.enabled) {
    return { ok: false, error: '自动评价未启用（enabled=false）', evalDate: evalDate || null, warnings, results: [] }
  }

  const timeZone = loaded.config.timezone
  const date = evalDate || getTodayDateString(timeZone, now)
  if (!parseEvalDate(date)) {
    return { ok: false, error: `日期格式非法：${date}（应为 YYYY-MM-DD）`, evalDate: date, warnings, results: [] }
  }

  const { targets, warnings: resolveWarnings } = await resolveAutoEvalTargets(db, loaded.config)
  warnings.push(...resolveWarnings)

  // 按班级分组：规则池与后门学生集合都是班级级概念
  const groups = new Map()
  for (const target of targets) {
    if (!groups.has(target.classId)) {
      groups.set(target.classId, { classId: target.classId, className: target.className, ownerUserId: target.ownerUserId, members: [] })
    }
    groups.get(target.classId).members.push(target)
  }

  const results = []
  for (const group of groups.values()) {
    const backdoorIds = group.members.map((member) => member.studentId)
    // 规则池：全局规则 + 该班教师的自定义规则
    const pool = (
      await db
        .prepare('SELECT id, name, points, category FROM evaluation_rules WHERE is_custom = 0 OR user_id = ?')
        .all(group.ownerUserId)
    ).filter((rule) => Number.isFinite(Number(rule.points)) && Number(rule.points) !== 0)

    for (const member of group.members) {
      try {
        const result = await runAutoEvaluationForStudent(db, {
          classId: group.classId,
          className: group.className,
          studentId: member.studentId,
          studentName: member.studentName,
          params: member.params,
          evalDate: date,
          now,
          timeZone,
          pool,
          backdoorIds,
        })
        results.push(result)
        if (verbose) {
          if (result.skipped) {
            console.log(`[auto-eval] ${date} ${group.className}/${result.studentName} 跳过：${result.reason}`)
          } else {
            console.log(
              `[auto-eval] ${date} ${group.className}/${result.studentName} ${result.delta >= 0 ? '+' : ''}${
                result.delta
              } 分（${result.records.length} 条）→ 累计 ${result.currentAfter}，真实第一名 ${result.topPoints}`,
            )
          }
        }
      } catch (error) {
        // 单生失败不影响其他学生
        console.error(`[auto-eval] ${date} ${group.className}/${member.studentName} 执行失败：`, error.message)
        results.push({ studentId: member.studentId, studentName: member.studentName, skipped: true, reason: `执行失败：${error.message}` })
      }
    }
  }

  if (verbose && warnings.length > 0) {
    console.warn(`[auto-eval] 配置告警：${warnings.join('；')}`)
  }

  return {
    ok: true,
    evalDate: date,
    filePath: loaded.filePath,
    warnings,
    results,
  }
}
