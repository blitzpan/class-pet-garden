import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import authRoutes from '../routes/auth.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { generateToken } from '../utils/token.js'
import { setupTestDb } from './testDb.js'

let server
let baseUrl
let db

function changePassword(token, body) {
  return fetch(`${baseUrl}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function getPasswordHash(userId) {
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)
  return row?.password_hash
}

beforeAll(async () => {
  db = await setupTestDb()
  const app = express()
  app.use(express.json())
  app.use('/auth', authRoutes)
  server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe('教师修改密码接口', () => {
  const teacherId = 'teacher-1'
  const guestId = 'guest-1'

  beforeEach(async () => {
    const now = Date.now()
    await db.prepare('INSERT INTO users (id, username, password_hash, is_guest, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(teacherId, '13800000000', hashPassword('123456'), 0, now)
    await db.prepare('INSERT INTO users (id, username, password_hash, is_guest, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(guestId, 'guest', '', 1, now)
  })

  it('原密码正确时更新密码', async () => {
    const res = await changePassword(generateToken(teacherId), {
      oldPassword: '123456',
      newPassword: 'abc123456'
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    const hash = await getPasswordHash(teacherId)
    expect(verifyPassword('abc123456', hash)).toBe(true)
    expect(verifyPassword('123456', hash)).toBe(false)
  })

  it('原密码错误时拒绝修改且不改动密码', async () => {
    const res = await changePassword(generateToken(teacherId), {
      oldPassword: 'wrong-pwd',
      newPassword: 'abc123456'
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('原密码错误')
    expect(verifyPassword('123456', await getPasswordHash(teacherId))).toBe(true)
  })

  it('新密码过短或过长时拒绝修改', async () => {
    const shortRes = await changePassword(generateToken(teacherId), {
      oldPassword: '123456',
      newPassword: '123'
    })
    expect(shortRes.status).toBe(400)

    const longRes = await changePassword(generateToken(teacherId), {
      oldPassword: '123456',
      newPassword: 'a'.repeat(65)
    })
    expect(longRes.status).toBe(400)

    expect(verifyPassword('123456', await getPasswordHash(teacherId))).toBe(true)
  })

  it('缺少参数时拒绝修改', async () => {
    const res = await changePassword(generateToken(teacherId), { oldPassword: '123456' })
    expect(res.status).toBe(400)
  })

  it('游客账号不能修改密码', async () => {
    const res = await changePassword(generateToken(guestId), {
      oldPassword: '123456',
      newPassword: 'abc123456'
    })

    expect(res.status).toBe(403)
    expect(await getPasswordHash(guestId)).toBe('')
  })

  it('未登录时拒绝修改', async () => {
    const res = await changePassword('', { oldPassword: '123456', newPassword: 'abc123456' })
    expect(res.status).toBe(401)
  })
})
