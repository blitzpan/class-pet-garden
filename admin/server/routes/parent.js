import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/token.js'
import { generateCaptcha, verifyCaptcha } from '../utils/captcha.js'
import { calculateLevel } from '../utils/level.js'
import { isMythicalPet } from '../utils/pets.js'
import { isClassVipActive } from '../utils/vip.js'
import { applyEvaluation, EvaluationCooldownError } from '../services/evaluationService.js'
import { parentAuthMiddleware as parentAuth } from '../middleware/parentAuth.js'
import { loginRateLimit } from '../middleware/rateLimit.js'

const router = Router()

function issueParentToken(studentId) {
  return generateToken(studentId)
}

// 领养/更换宠物（与管理端 PUT /students/:id/pet 逻辑一致，但绑定到登录的家长学生）
async function adoptPet(database, studentId, petType) {
  const student = await database.prepare('SELECT * FROM students WHERE id = ?').get(studentId)
  if (!student) throw new Error('学生不存在')
  if (!petType) throw new Error('请选择宠物')
  if (isMythicalPet(petType) && !(await isClassVipActive(database, student.class_id))) {
    throw new Error('神兽伙伴需开通 VIP 后才能领养')
  }
  const now = Date.now()
  if (student.pet_type && student.pet_level >= 8) {
    await database.prepare('INSERT INTO badges (id, student_id, pet_type, earned_at) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), studentId, student.pet_type, now)
  }
  if (student.pet_type) {
    await database.prepare('UPDATE students SET pet_type = ?, pet_level = 1, pet_exp = 0, total_points = 0 WHERE id = ?')
      .run(petType, studentId)
  } else {
    const newExp = Math.max(0, student.total_points)
    const newLevel = calculateLevel(newExp)
    await database.prepare('UPDATE students SET pet_type = ?, pet_level = ?, pet_exp = ? WHERE id = ?')
      .run(petType, newLevel, newExp, studentId)
  }
  return { success: true }
}

// 验证码：乘法数学题（小朋友不会），无状态 HMAC
router.get('/captcha', (req, res) => {
  res.json(generateCaptcha())
})

// 首次设置家长密码（需先通过验证码，防小朋友乱设）
router.post('/setup', loginRateLimit, async (req, res) => {
  const { studentId, password, captchaToken, captchaAnswer } = req.body
  if (!studentId || !password) return res.status(400).json({ error: '缺少参数' })
  if (!verifyCaptcha(captchaToken, captchaAnswer)) return res.status(400).json({ error: '验证码错误，请重新计算' })
  if (String(password).length < 4) return res.status(400).json({ error: '密码至少 4 位' })

  const student = await db.prepare('SELECT id, parent_password_hash FROM students WHERE id = ?').get(studentId)
  if (!student) return res.status(404).json({ error: '学生不存在' })
  if (student.parent_password_hash) return res.status(409).json({ error: '该学生已设置家长密码，请直接登录' })

  await db.prepare('UPDATE students SET parent_password_hash = ? WHERE id = ?').run(hashPassword(password), studentId)
  res.json({ token: issueParentToken(studentId), studentId })
})

// 家长登录
router.post('/login', loginRateLimit, async (req, res) => {
  const { studentId, password } = req.body
  if (!studentId || !password) return res.status(400).json({ error: '缺少参数' })

  const student = await db.prepare('SELECT id, parent_password_hash FROM students WHERE id = ?').get(studentId)
  if (!student) return res.status(404).json({ error: '学生不存在' })
  if (!student.parent_password_hash) return res.status(400).json({ error: '尚未设置家长密码', code: 'NO_PASSWORD_SET' })
  if (!verifyPassword(password, student.parent_password_hash)) return res.status(401).json({ error: '密码错误' })

  res.json({ token: issueParentToken(studentId), studentId })
})

router.post('/logout', (req, res) => res.json({ success: true }))

router.get('/me', parentAuth, (req, res) => res.json({ studentId: req.studentId }))

// 修改密码（已登录）
router.post('/change-password', parentAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '缺少参数' })
  if (String(newPassword).length < 4) return res.status(400).json({ error: '新密码至少 4 位' })

  const student = await db.prepare('SELECT parent_password_hash FROM students WHERE id = ?').get(req.studentId)
  if (!student || !student.parent_password_hash) return res.status(400).json({ error: '尚未设置家长密码' })
  if (!verifyPassword(oldPassword, student.parent_password_hash)) return res.status(401).json({ error: '原密码错误' })

  await db.prepare('UPDATE students SET parent_password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.studentId)
  res.json({ success: true })
})

// 领取宠物（已登录，绑定该学生）
router.post('/adopt', parentAuth, async (req, res) => {
  const { petType } = req.body
  try {
    const result = await adoptPet(db, req.studentId, petType)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 按规则加减分（已登录，绑定该学生）
router.post('/score', parentAuth, async (req, res) => {
  const { ruleId } = req.body
  if (!ruleId) return res.status(400).json({ error: '缺少规则' })
  try {
    const student = await db.prepare('SELECT id, class_id FROM students WHERE id = ?').get(req.studentId)
    if (!student) return res.status(404).json({ error: '学生不存在' })
    const rule = await db.prepare('SELECT * FROM evaluation_rules WHERE id = ?').get(ruleId)
    if (!rule) return res.status(404).json({ error: '规则不存在' })

    const result = await applyEvaluation(db, {
      classId: student.class_id,
      studentId: req.studentId,
      points: rule.points,
      reason: rule.name,
      category: rule.category,
    })
    res.json(result)
  } catch (e) {
    if (e instanceof EvaluationCooldownError) {
      return res.status(429).json({ error: e.message, remainingMs: e.remainingMs })
    }
    res.status(400).json({ error: e.message })
  }
})

// 当前学生的宠物与记录（已登录）
router.get('/my-pet', parentAuth, async (req, res) => {
  const student = await db.prepare(`
    SELECT s.id, s.name, s.student_no, s.total_points, s.pet_type, s.pet_level, s.pet_exp, c.name AS class_name
    FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ?
  `).get(req.studentId)
  const records = await db.prepare('SELECT id, points, reason, category, timestamp FROM evaluation_records WHERE student_id = ? ORDER BY timestamp DESC LIMIT 50').all(req.studentId)
  res.json({ student, records })
})

export default router
