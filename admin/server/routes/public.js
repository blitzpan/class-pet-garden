import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

// 成长记录按「东八区自然日」展示，家长端默认看最近一周。
// 单学生的记录量在百级（且有 idx_records_student_id 索引），取 200 条足够覆盖一周，
// 同时避免一次把全部历史拖出来；更早的记录用 before 游标继续翻。
const SHARE_RECORD_LIMIT = 200

function shanghaiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + delta * 86400000).toISOString().slice(0, 10)
}

/** 连续打卡天数：今天还没打卡时从昨天起算，避免下午打开就显示 0（days 为倒序去重日期） */
function computeStreak(days, today) {
  if (!days.length) return 0
  const start = days.includes(today) ? today : shiftDay(today, -1)
  if (!days.includes(start)) return 0
  let streak = 0
  let cursor = start
  for (const day of days) {
    if (day !== cursor) break
    streak += 1
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

// 班级列表（公开，供家长端班级切换）
router.get('/classes', async (req, res) => {
  const classes = await db.prepare('SELECT id, name FROM classes ORDER BY name').all()
  res.json({ classes })
})

// 班级排行榜（按积分降序，含排名）
router.get('/leaderboard', async (req, res) => {
  const { classId } = req.query
  if (!classId) return res.status(400).json({ error: '缺少 classId' })

  const rows = await db.prepare(`
    SELECT s.id AS studentId, s.name, s.student_no, s.total_points, s.pet_type, s.pet_level
    FROM students s WHERE s.class_id = ? ORDER BY s.total_points DESC, s.name
  `).all(classId)
  const students = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  res.json({ students })
})

// 班级评价规则（家长端加减分按钮数据）：全局规则 + 本班教师自定义规则
router.get('/rules', async (req, res) => {
  const { classId } = req.query
  let rules
  if (classId) {
    rules = await db.prepare(`
      SELECT id, name, points, category FROM evaluation_rules
      WHERE user_id IS NULL OR user_id = (SELECT user_id FROM classes WHERE id = ?)
      ORDER BY category, points DESC
    `).all(classId)
  } else {
    rules = await db.prepare(`
      SELECT id, name, points, category FROM evaluation_rules
      WHERE user_id IS NULL ORDER BY category, points DESC
    `).all()
  }
  res.json({ rules })
})

// 学生分享 / 宠物详情（公开）
router.get('/students/:studentId/share', async (req, res) => {
  const student = await db.prepare(`
    SELECT s.id, s.name, s.student_no, s.total_points, s.pet_type, s.pet_level, s.pet_exp, s.parent_password_hash, c.id AS class_id, c.name AS class_name
    FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ?
  `).get(req.params.studentId)

  if (!student) {
    return res.status(404).json({ error: '学生不存在' })
  }

  const hasPet = !!student.pet_type
  const hasParentPassword = !!student.parent_password_hash

  // day = 东八区自然日，前端直接用它分组，避免前后端时区口径不一致
  const before = Number(req.query.before) || 0
  const params = [req.params.studentId]
  if (before) params.push(before)
  const rows = await db.prepare(`
    SELECT id, points, reason, category, timestamp,
           date(timestamp / 1000, 'unixepoch', '+8 hours') AS day
    FROM evaluation_records
    WHERE student_id = ?${before ? ' AND timestamp <= ?' : ''}
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(...params, SHARE_RECORD_LIMIT + 1)
  const hasMore = rows.length > SHARE_RECORD_LIMIT
  const records = hasMore ? rows.slice(0, SHARE_RECORD_LIMIT) : rows

  const levelConfigRow = await db.prepare("SELECT value FROM settings WHERE `key` = 'levelConfig'").get()
  let levelConfig = [40, 60, 80, 100, 120, 140, 160]
  if (levelConfigRow?.value) {
    try { levelConfig = JSON.parse(levelConfigRow.value) } catch { /* 用默认 */ }
  }

  // 打卡日（按「东八区的自然日」去重）：累计天数供分享卡，连续天数供成长记录页
  const dayRows = await db.prepare(`
    SELECT DISTINCT date(timestamp / 1000, 'unixepoch', '+8 hours') AS day
    FROM evaluation_records WHERE student_id = ? ORDER BY day DESC
  `).all(req.params.studentId)
  const checkinDays = dayRows.length
  const today = shanghaiToday()
  const streakDays = computeStreak(dayRows.map((r) => r.day), today)

  res.json({
    student,
    hasPet,
    hasParentPassword,
    records,
    levelConfig,
    checkinDays,
    streakDays,
    today,
    hasMore,
  })
})

export default router
