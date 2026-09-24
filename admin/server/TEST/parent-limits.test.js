import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import parentRoutes, {
  PARENT_JOIN_CLASS_STUDENT_LIMIT,
  PARENT_DAILY_SCORE_LIMIT
} from '../routes/parent.js'
import { setupTestDb } from './testDb.js'
import { generateCaptcha } from '../utils/captcha.js'
import { generateToken } from '../utils/token.js'

let server
let baseUrl
let db

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

async function post(path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  return { status: res.status, data: await res.json() }
}

function joinPayload(name) {
  const captcha = generateCaptcha()
  return {
    classId: 'class-1',
    name,
    inviteCode: '123456',
    password: '1234',
    captchaToken: captcha.token,
    captchaAnswer: captcha.a * captcha.b
  }
}

async function insertStudents(count, { claimedIndex = -1 } = {}) {
  const stmt = await db.prepare(
    'INSERT INTO students (id, class_id, name, total_points, pet_level, pet_exp, parent_password_hash) VALUES (?, ?, ?, 0, 1, 0, ?)'
  )
  for (let i = 0; i < count; i++) {
    // 预建学生默认没有家长密码，可被认领
    const hash = i === claimedIndex ? null : 'hashed'
    await stmt.run(`student-bulk-${i}`, 'class-1', `同学${i}`, hash)
  }
}

async function insertStudent(studentId, name) {
  await db.prepare(
    'INSERT INTO students (id, class_id, name, total_points, pet_level, pet_exp, parent_password_hash) VALUES (?, ?, ?, 0, 1, 0, ?)'
  ).run(studentId, 'class-1', name, 'hashed')
}

async function insertRecords(studentId, count, dayStartMs) {
  const stmt = await db.prepare(
    'INSERT INTO evaluation_records (id, class_id, student_id, points, reason, category, timestamp) VALUES (?, ?, ?, 2, ?, ?, ?)'
  )
  for (let i = 0; i < count; i++) {
    await stmt.run(`record-${dayStartMs}-${i}`, 'class-1', studentId, `历史项目${i}`, '学习', dayStartMs + (i + 1) * 60 * 1000)
  }
}

describe('家长端限制：班级人数与每日加减分条数', () => {
  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/parent', parentRoutes)
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/parent`
  })

  afterAll(() => {
    server?.close()
  })

  beforeEach(async () => {
    db = await setupTestDb()
    const now = Date.now()
    await db.prepare(
      'INSERT INTO classes (id, user_id, name, invite_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('class-1', 'user-1', '三年二班', '123456', now, now)
    await db.prepare(
      'INSERT INTO evaluation_rules (id, name, points, category, is_custom, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run('rule-1', '按时完成作业', 2, '学习', now)
  })

  it(`班级满 ${PARENT_JOIN_CLASS_STUDENT_LIMIT} 人时，家长端不能加人`, async () => {
    await insertStudents(PARENT_JOIN_CLASS_STUDENT_LIMIT)

    const res = await post('/join', joinPayload('新同学'))

    expect(res.status).toBe(400)
    expect(res.data.code).toBe('CLASS_FULL')
  })

  it('班级未满时，家长端可以加人', async () => {
    await insertStudents(PARENT_JOIN_CLASS_STUDENT_LIMIT - 1)

    const res = await post('/join', joinPayload('新同学'))

    expect(res.status).toBe(200)
    expect(res.data.claimed).toBe(false)
  })

  it('已满员的班级仍可认领老师预建的学生', async () => {
    await insertStudents(PARENT_JOIN_CLASS_STUDENT_LIMIT, { claimedIndex: 0 })

    const res = await post('/join', joinPayload('同学0'))

    expect(res.status).toBe(200)
    expect(res.data.claimed).toBe(true)
  })

  it(`当天已有 ${PARENT_DAILY_SCORE_LIMIT} 条记录时，家长端不能再加减分`, async () => {
    await insertStudent('student-1', '小明')
    await insertRecords('student-1', PARENT_DAILY_SCORE_LIMIT, startOfToday())

    const res = await post('/score', { ruleId: 'rule-1' }, generateToken('student-1'))

    expect(res.status).toBe(429)
    expect(res.data.code).toBe('DAILY_LIMIT')
  })

  it(`当天第 ${PARENT_DAILY_SCORE_LIMIT} 条加减分仍可提交`, async () => {
    await insertStudent('student-1', '小明')
    await insertRecords('student-1', PARENT_DAILY_SCORE_LIMIT - 1, startOfToday())

    const res = await post('/score', { ruleId: 'rule-1' }, generateToken('student-1'))

    expect(res.status).toBe(200)
  })

  it('昨天的记录不计入今天的条数', async () => {
    await insertStudent('student-1', '小明')
    await insertRecords('student-1', PARENT_DAILY_SCORE_LIMIT, startOfToday() - 24 * 60 * 60 * 1000)

    const res = await post('/score', { ruleId: 'rule-1' }, generateToken('student-1'))

    expect(res.status).toBe(200)
  })
})
