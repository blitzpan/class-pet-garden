import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

import { setupTestDb } from './testDb.js'
import { loadAutoEvalConfig, resolveConfigPath } from '../utils/autoEvalConfig.js'
import { runAutoEvaluationForDate } from '../services/autoEvalService.js'
import { applyEvaluation, revokeEvaluation } from '../services/evaluationService.js'

// 测试统一使用 Asia/Shanghai（UTC+8），日期全部取过去时间，避免回填时间戳落在未来触发冷却
const TZ_OFFSET_HOURS = 8
const TZ = 'Asia/Shanghai'
const DAILY_MIN = 2
const DAILY_MAX = 8
const GAP = 2
const MAX_DROP = 4
const WEEKEND_FACTOR = 0.5

let db
const tempFiles = []

beforeEach(async () => {
  db = await setupTestDb()
})

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    try {
      fs.unlinkSync(file)
    } catch (e) {
      // 已删除则忽略
    }
  }
  delete process.env.AUTO_EVAL_CONFIG
})

/** 写一份临时配置文件并指向它 */
function writeConfig(value) {
  const file = path.join(os.tmpdir(), `autoEval-test-${uuidv4()}.json`)
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
  tempFiles.push(file)
  process.env.AUTO_EVAL_CONFIG = file
  return file
}

/** 指定日期的本地 20:35（定时任务执行时刻之后） */
function nowAt2035(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12, 35, 0)
}

/** 指定日期的本地某个时刻 */
function nowAt(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, hour - TZ_OFFSET_HOURS, minute, 0)
}

function midnightUtc(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 0, 0, 0) - TZ_OFFSET_HOURS * 3600 * 1000
}

function localHour(dateStr, ms) {
  return (ms - midnightUtc(dateStr)) / 3600000
}

function isWeekend(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** 建一个班级：真实学生若干（含第一名）+ 后门学生若干，并铺一套评价规则 */
async function seedClass({ realPoints = [90, 100, 125, 110], backdoorNames = ['后门甲', '后门乙'] } = {}) {
  const userId = uuidv4()
  await db.prepare('INSERT INTO users (id, username, password_hash, is_guest, created_at) VALUES (?,?,?,0,?)')
    .run(userId, `teacher_${userId.slice(0, 8)}`, 'x', Date.now())

  const classId = uuidv4()
  await db.prepare('INSERT INTO classes (id, user_id, name, created_at) VALUES (?,?,?,?)')
    .run(classId, userId, '测试班', Date.now())

  const realIds = []
  for (let i = 0; i < realPoints.length; i += 1) {
    const id = uuidv4()
    realIds.push(id)
    await db.prepare('INSERT INTO students (id, class_id, name, total_points, pet_level, pet_exp, created_at) VALUES (?,?,?,?,1,0,?)')
      .run(id, classId, `真实${i + 1}`, realPoints[i], Date.now())
  }

  const backdoorIds = []
  for (const name of backdoorNames) {
    const id = uuidv4()
    backdoorIds.push(id)
    await db.prepare('INSERT INTO students (id, class_id, name, total_points, pet_level, pet_exp, created_at) VALUES (?,?,?,?,1,0,?)')
      .run(id, classId, name, 0, Date.now())
  }

  // 规则池：覆盖 学习/行为/健康/家庭 四类的正负分值
  const rules = [
    ['课堂积极发言', 2, '学习'], ['作业完成优秀', 3, '学习'], ['默写全对', 1, '学习'],
    ['单元测验进步', 2, '学习'], ['未完成作业', -2, '学习'], ['作业潦草', -1, '学习'],
    ['早读认真专注', 1, '行为'], ['主动帮助同学', 2, '行为'], ['眼保健操认真', 1, '行为'],
    ['上课讲话', -1, '行为'], ['课间追逐打闹', -3, '行为'],
    ['座位周围无垃圾', 1, '健康'], ['主动倒垃圾', 2, '健康'], ['浪费粮食', -2, '健康'],
    ['认真完成作业', 2, '家庭'], ['书写工整坐姿端正', 1, '家庭'], ['分担家务帮助父母', 2, '家庭'],
    ['早睡早起自己的事自己做', 1, '家庭'], ['不写作业敷衍了事', -2, '家庭'], ['沉迷手机电视超时', -1, '家庭'],
  ]
  const now = Date.now()
  for (const [name, points, category] of rules) {
    await db.prepare('INSERT INTO evaluation_rules (id, name, points, category, is_custom, created_at) VALUES (?,?,?,?,0,?)')
      .run(uuidv4(), name, points, category, now)
  }

  return { userId, classId, realIds, backdoorIds }
}

function baseConfig(classId, students, overrides = {}) {
  return {
    enabled: true,
    timezone: TZ,
    runAt: '20:30',
    defaults: {
      dailyMin: DAILY_MIN,
      dailyMax: DAILY_MAX,
      gapToTop: GAP,
      maxDailyDrop: MAX_DROP,
      weekendFactor: WEEKEND_FACTOR,
      recordsPerDay: [2, 4],
      weekendRecordsPerDay: [1, 2],
      negativeChance: 0.3,
      ...overrides,
    },
    classes: [{ classId, students }],
  }
}

/** 取某学生当天（本地时间）的全部评价记录 */
async function dayRecords(studentId, dateStr, now) {
  const rows = await db.prepare(
    'SELECT points, reason, category, timestamp FROM evaluation_records WHERE student_id = ? ORDER BY timestamp',
  ).all(studentId)
  const start = midnightUtc(dateStr)
  return rows.filter((row) => row.timestamp >= start && row.timestamp <= now)
}

async function totalPoints(studentId) {
  return (await db.prepare('SELECT total_points FROM students WHERE id = ?').get(studentId)).total_points
}

describe('自动评价：配置加载与校验', () => {
  it('显式路径优先于默认路径', () => {
    const file = writeConfig({ enabled: true })
    const { filePath } = loadAutoEvalConfig()
    expect(filePath).toBe(file)
  })

  it('非法 JSON 时返回错误而不是抛异常', () => {
    writeConfig('{ 这不是 JSON ')
    const { config, error } = loadAutoEvalConfig()
    expect(config).toBeNull()
    expect(error).toContain('解析失败')
  })

  it('非法时区回退为 Asia/Shanghai 并给出告警', () => {
    writeConfig({ enabled: true, timezone: 'Mars/Phobos' })
    const { config, warnings } = loadAutoEvalConfig()
    expect(config.timezone).toBe('Asia/Shanghai')
    expect(warnings.join()).toContain('时区无效')
  })

  it('非法 runAt 回退为 20:30 并给出告警', () => {
    writeConfig({ enabled: true, runAt: '99:99' })
    const { config, warnings } = loadAutoEvalConfig()
    expect(config.runAt).toEqual({ hour: 20, minute: 30 })
    expect(warnings.join()).toContain('runAt 无效')
  })

  it('dailyMin 大于 dailyMax 时自动纠正顺序', () => {
    writeConfig({ enabled: true, defaults: { dailyMin: 9, dailyMax: 3 } })
    const { config } = loadAutoEvalConfig()
    expect(config.defaults.dailyMin).toBe(3)
    expect(config.defaults.dailyMax).toBe(9)
  })

  it('gapToTop 为 0 时至少修正为 1（同分按宠物等级排序仍可能判第一）', () => {
    writeConfig({ enabled: true, defaults: { gapToTop: 0 } })
    const { config } = loadAutoEvalConfig()
    expect(config.defaults.gapToTop).toBe(1)
  })

  it('未启用时不执行', async () => {
    const { classId } = await seedClass()
    writeConfig({ ...baseConfig(classId, [{ name: '后门甲' }]), enabled: false })
    const summary = await runAutoEvaluationForDate(db, { evalDate: '2026-08-17', now: nowAt2035('2026-08-17'), verbose: false })
    expect(summary.ok).toBe(false)
    expect(summary.error).toContain('未启用')
    expect((await db.prepare('SELECT COUNT(*) AS c FROM evaluation_records').get()).c).toBe(0)
  })

  it('日期格式非法时直接报错', async () => {
    const { classId } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const summary = await runAutoEvaluationForDate(db, { evalDate: '2026/08/17', verbose: false })
    expect(summary.ok).toBe(false)
    expect(summary.error).toContain('日期格式非法')
  })
})

describe('自动评价：正常执行', () => {
  it('平日：净增落在配置区间内，积分与记录一致，且不超过天花板', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }, { name: '后门乙' }]))
    const date = '2026-08-17' // 周一
    expect(isWeekend(date)).toBe(false)

    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    expect(summary.ok).toBe(true)
    expect(summary.warnings).toEqual([])
    expect(summary.results.length).toBe(2)

    for (const result of summary.results) {
      expect(result.skipped).toBeFalsy()
      expect(result.delta).toBeGreaterThanOrEqual(DAILY_MIN)
      expect(result.delta).toBeLessThanOrEqual(DAILY_MAX)
      expect(await totalPoints(result.studentId)).toBe(result.delta)
      // 天花板 = 真实第一名 125 - gap 2
      expect(result.cap).toBe(123)
      expect(await totalPoints(result.studentId)).toBeLessThanOrEqual(result.cap)

      const records = await dayRecords(result.studentId, date, nowAt2035(date))
      expect(records.length).toBeGreaterThanOrEqual(2)
      expect(records.reduce((sum, r) => sum + r.points, 0)).toBe(result.delta)
      // 理由不重复、分值非零、时间落在可信时段且间隔 ≥ 20 分钟
      expect(new Set(records.map((r) => r.reason)).size).toBe(records.length)
      let prev = null
      for (const record of records) {
        const hour = localHour(date, record.timestamp)
        expect(hour).toBeGreaterThanOrEqual(8)
        expect(hour).toBeLessThanOrEqual(20.5)
        expect(record.timestamp).toBeLessThanOrEqual(nowAt2035(date))
        if (prev !== null) {
          expect(record.timestamp - prev).toBeGreaterThanOrEqual(20 * 60 * 1000)
        }
        prev = record.timestamp
      }
    }
  })

  it('周末：只用家庭类项目，且区间按系数减量', async () => {
    const { classId } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const date = '2026-08-15' // 周六
    expect(isWeekend(date)).toBe(true)

    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    const result = summary.results[0]
    expect(result.skipped).toBeFalsy()
    expect(result.delta).toBeGreaterThanOrEqual(Math.round(DAILY_MIN * WEEKEND_FACTOR))
    expect(result.delta).toBeLessThanOrEqual(Math.round(DAILY_MAX * WEEKEND_FACTOR))

    const records = await dayRecords(result.studentId, date, nowAt2035(date))
    expect(records.length).toBeGreaterThanOrEqual(1)
    for (const record of records) {
      expect(record.category).toBe('家庭')
    }
  })

  it('同一天重复执行不重复加分（幂等）', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const date = '2026-08-18'
    const now = nowAt2035(date)

    const first = await runAutoEvaluationForDate(db, { evalDate: date, now, verbose: false })
    const firstTotal = await totalPoints(backdoorIds[0])

    const second = await runAutoEvaluationForDate(db, { evalDate: date, now, verbose: false })
    expect(second.results[0].skipped).toBe(true)
    expect(second.results[0].reason).toContain('幂等')
    expect(await totalPoints(backdoorIds[0])).toBe(firstTotal)
    expect((await db.prepare('SELECT COUNT(*) AS c FROM auto_eval_log WHERE eval_date = ?').get(date)).c).toBe(1)
    expect(first.results[0].delta).toBe(firstTotal)
  })

  it('并发触发只写一份记录（互斥 + 事务占位双保险）', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }, { name: '后门乙' }]))
    const date = '2026-08-19'
    const now = nowAt2035(date)

    const [a, b] = await Promise.all([
      runAutoEvaluationForDate(db, { evalDate: date, now, verbose: false }),
      runAutoEvaluationForDate(db, { evalDate: date, now, verbose: false }),
    ])

    // 两次调用中只有一次真正执行
    const executed = [a, b].filter((s) => s.ok)
    const skipped = [a, b].filter((s) => !s.ok)
    expect(executed.length).toBe(1)
    expect(skipped.length).toBe(1)

    const first = executed[0]
    for (const result of first.results) {
      const records = await dayRecords(result.studentId, date, now)
      expect(records.length).toBe(result.records.length)
      expect(await totalPoints(result.studentId)).toBe(result.delta)
    }
    expect((await db.prepare('SELECT COUNT(*) AS c FROM auto_eval_log WHERE eval_date = ?').get(date)).c)
      .toBe(backdoorIds.length)
  })

  it('触顶后扣分回落，并逐日回到天花板以下', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const cap = 125 - GAP

    // 手动把它抬到第一名之上
    await db.prepare('UPDATE students SET total_points = ? WHERE id = ?').run(125 + 20, backdoorIds[0])

    const date = '2026-08-20'
    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    const result = summary.results[0]
    expect(result.delta).toBeLessThan(0)
    expect(result.delta).toBeGreaterThanOrEqual(-MAX_DROP)

    let current = await totalPoints(backdoorIds[0])
    for (let i = 0; i < 10 && current > cap; i += 1) {
      const d = `2026-08-${String(21 + i).padStart(2, '0')}`
      const s = await runAutoEvaluationForDate(db, { evalDate: d, now: nowAt2035(d), verbose: false })
      const r = s.results[0]
      if (r.skipped) break
      current += r.delta
    }
    expect(current).toBeLessThanOrEqual(cap)
  })

  it('长跑 60 天：任何一天都不超过天花板，并自然贴住第二名', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }, { name: '后门乙' }]))
    const cap = 125 - GAP

    const start = Date.UTC(2026, 3, 1)
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(start + i * 86400000)
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
      for (const result of summary.results) {
        if (result.skipped) continue
        expect(await totalPoints(result.studentId)).toBeLessThanOrEqual(cap)
      }
    }

    for (const id of backdoorIds) {
      const points = await totalPoints(id)
      expect(points).toBeLessThanOrEqual(cap)
      expect(points).toBeGreaterThanOrEqual(cap - DAILY_MAX) // 应稳定咬住第二名
    }
  })
})

describe('自动评价：异常与边界', () => {
  it('班级内没有可对标的真实学生时跳过', async () => {
    const { classId, realIds } = await seedClass({ realPoints: [80], backdoorNames: ['后门甲'] })
    // 删掉唯一的真实学生，只剩后门学生
    await db.prepare('DELETE FROM students WHERE id = ?').run(realIds[0])
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))

    const date = '2026-08-17'
    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    expect(summary.results[0].skipped).toBe(true)
    expect(summary.results[0].reason).toContain('没有可用于对标')
  })

  it('真实第一名分数过低时跳过，不会被扣成负分', async () => {
    const { classId, backdoorIds } = await seedClass({ realPoints: [1], backdoorNames: ['后门甲'] })
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))

    const date = '2026-08-17'
    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    expect(summary.results[0].skipped).toBe(true)
    expect(summary.results[0].reason).toContain('分数过低')
    expect(await totalPoints(backdoorIds[0])).toBe(0)
  })

  it('配置里的学生不存在时给出告警但不影响其他学生', async () => {
    const { classId } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '查无此人' }, { name: '后门甲' }]))

    const date = '2026-08-17'
    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    expect(summary.warnings.join()).toContain('查无此人')
    expect(summary.results.length).toBe(1)
    expect(summary.results[0].studentName).toBe('后门甲')
  })

  it('班级不存在时给出告警', async () => {
    await seedClass()
    writeConfig(baseConfig('not-exist-class', [{ name: '后门甲' }]))
    const summary = await runAutoEvaluationForDate(db, { evalDate: '2026-08-17', now: nowAt2035('2026-08-17'), verbose: false })
    expect(summary.warnings.join()).toContain('找不到班级')
    expect(summary.results).toEqual([])
  })

  it('未来日期不写入任何记录', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const today = '2026-08-17'
    const tomorrow = '2026-08-18'

    const summary = await runAutoEvaluationForDate(db, { evalDate: tomorrow, now: nowAt2035(today), verbose: false })
    expect(summary.results[0].skipped).toBe(true)
    expect(summary.results[0].reason).toContain('回填时段')
    expect(await totalPoints(backdoorIds[0])).toBe(0)
  })

  it('凌晨触发（当天时段尚未开始）时不写入记录', async () => {
    const { classId, backdoorIds } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const date = '2026-08-17'

    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt(date, 6, 0), verbose: false })
    expect(summary.results[0].skipped).toBe(true)
    expect(await totalPoints(backdoorIds[0])).toBe(0)
  })

  it('后门学生之间不互相抬高天花板（两名后门学生都不会成为对标对象）', async () => {
    const { classId, backdoorIds } = await seedClass({ realPoints: [50] })
    writeConfig(baseConfig(classId, [{ name: '后门甲' }, { name: '后门乙' }]))

    const date = '2026-08-17'
    const summary = await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    for (const result of summary.results) {
      // 真实第一名是 50，天花板 48；后门学生即使互相超过也不会被当成第一名
      expect(result.topPoints).toBe(50)
      expect(result.cap).toBe(48)
    }
    // 多次执行后仍以真实学生为天花板
    for (let i = 0; i < 5; i += 1) {
      const d = `2026-08-${String(18 + i).padStart(2, '0')}`
      const s = await runAutoEvaluationForDate(db, { evalDate: d, now: nowAt2035(d), verbose: false })
      for (const result of s.results) {
        if (result.skipped) continue
        expect(result.topPoints).toBe(50)
      }
    }
    for (const id of backdoorIds) {
      expect(await totalPoints(id)).toBeLessThanOrEqual(48)
    }
  })

  it('删除班级时自动评价日志一并清理（不残留孤儿数据）', async () => {
    const { classId, userId } = await seedClass()
    writeConfig(baseConfig(classId, [{ name: '后门甲' }]))
    const date = '2026-08-17'
    await runAutoEvaluationForDate(db, { evalDate: date, now: nowAt2035(date), verbose: false })
    expect((await db.prepare('SELECT COUNT(*) AS c FROM auto_eval_log').get()).c).toBe(1)

    const { deleteClassData } = await import('../utils/adminCleanup.js')
    await deleteClassData(db, classId)
    expect((await db.prepare('SELECT COUNT(*) AS c FROM auto_eval_log WHERE class_id = ?').get(classId)).c).toBe(0)
    expect(userId).toBeTruthy()
  })
})

describe('既有评价链路回归', () => {
  it('不传 timestamp 时使用当前时间，积分与宠物经验联动正确', async () => {
    const { classId, backdoorIds } = await seedClass()
    await db.prepare('UPDATE students SET pet_type = ? WHERE id = ?').run('cat', backdoorIds[0])

    const before = Date.now()
    const result = await applyEvaluation(db, {
      classId,
      studentId: backdoorIds[0],
      points: 3,
      reason: '课堂积极发言',
      category: '学习',
    })
    expect(result.timestamp).toBeGreaterThanOrEqual(before)
    expect(result.petExp).toBe(3)

    const student = await db.prepare('SELECT total_points, pet_exp FROM students WHERE id = ?').get(backdoorIds[0])
    expect(student.total_points).toBe(3)
    expect(student.pet_exp).toBe(3)
  })

  it('传入 timestamp 时按回填时间落库（自动评价依赖该能力）', async () => {
    const { classId, backdoorIds } = await seedClass()
    const backfill = nowAt2035('2026-08-17')
    const result = await applyEvaluation(db, {
      classId,
      studentId: backdoorIds[0],
      points: -2,
      reason: '未完成作业',
      category: '学习',
      timestamp: backfill,
    })
    expect(result.timestamp).toBe(backfill)
    const record = await db.prepare('SELECT timestamp FROM evaluation_records WHERE id = ?').get(result.id)
    expect(record.timestamp).toBe(backfill)
  })

  it('撤销评价可正确回退积分', async () => {
    const { classId, backdoorIds } = await seedClass()
    const result = await applyEvaluation(db, {
      classId,
      studentId: backdoorIds[0],
      points: 5,
      reason: '作业完成优秀',
      category: '学习',
    })
    expect(await totalPoints(backdoorIds[0])).toBe(5)

    await revokeEvaluation(db, result.id)
    expect(await totalPoints(backdoorIds[0])).toBe(0)
    expect((await db.prepare('SELECT COUNT(*) AS c FROM evaluation_records').get()).c).toBe(0)
  })
})
