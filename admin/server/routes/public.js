import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

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

// 全局评价规则（家长端加减分按钮数据）
router.get('/rules', async (req, res) => {
  const rules = await db.prepare('SELECT id, name, points, category FROM evaluation_rules WHERE user_id IS NULL ORDER BY category, points DESC').all()
  res.json({ rules })
})

// 学生分享 / 宠物详情（公开）
router.get('/students/:studentId/share', async (req, res) => {
  const student = await db.prepare(`
    SELECT s.id, s.name, s.student_no, s.total_points, s.pet_type, s.pet_level, s.pet_exp, c.name AS class_name
    FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ?
  `).get(req.params.studentId)

  if (!student) {
    return res.status(404).json({ error: '学生不存在' })
  }

  const hasPet = !!student.pet_type
  const records = await db.prepare(`
    SELECT id, points, reason, category, timestamp FROM evaluation_records WHERE student_id = ? ORDER BY timestamp DESC LIMIT 50
  `).all(req.params.studentId)

  const levelConfigRow = await db.prepare("SELECT value FROM settings WHERE `key` = 'levelConfig'").get()
  let levelConfig = [40, 60, 80, 100, 120, 140, 160]
  if (levelConfigRow?.value) {
    try { levelConfig = JSON.parse(levelConfigRow.value) } catch { /* 用默认 */ }
  }

  res.json({ student, hasPet, records, levelConfig })
})

export default router
