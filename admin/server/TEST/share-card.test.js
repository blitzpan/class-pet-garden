// @vitest-environment node
// happy-dom 会把 fetch 换成受同源策略约束的实现，这里需要 Node 原生 fetch 直连本地服务
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

// 独立临时目录，避免污染真实 uploads；必须在导入路由之前设置
const TMP_DIR = path.join(os.tmpdir(), `share-card-test-${process.pid}-${Date.now()}`)
process.env.SHARE_CARD_DIR = TMP_DIR

const { default: shareCardRoutes, cleanExpiredCards } = await import('../routes/shareCard.js')

const MAX_FILE_SIZE = 1024 * 1024
const MAX_TOTAL_FILES = 200
const EXPIRE_MS = 5 * 60 * 1000

/** 路由只校验 JPEG 前 3 字节魔数，构造够用即可 */
function jpegBuffer(size = 1024) {
  const buf = Buffer.alloc(size, 0x11)
  buf[0] = 0xff
  buf[1] = 0xd8
  buf[2] = 0xff
  buf[3] = 0xe0
  buf[size - 2] = 0xff
  buf[size - 1] = 0xd9
  return buf
}

function jpegPayload(size = 1024) {
  return `data:image/jpeg;base64,${jpegBuffer(size).toString('base64')}`
}

function seedFile(name = `${uuidv4()}.jpg`, size = 1024, ageMs = 0) {
  const fp = path.join(TMP_DIR, name)
  fs.writeFileSync(fp, jpegBuffer(size))
  if (ageMs) {
    const t = (Date.now() - ageMs) / 1000
    fs.utimesSync(fp, t, t)
  }
  return fp
}

let server
let origin
let baseUrl

beforeAll(async () => {
  const app = express()
  app.set('trust proxy', 1)
  // 与 server/index.js 保持一致：share-cards 自带 body parser，必须挂在全局 json 之前
  app.use('/api/public/share-cards', shareCardRoutes)
  app.use(express.json())
  // 与 server/index.js 一致：全局错误处理器会把未兜住的错误统一转成 500
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    res.status(500).json({ error: '服务器内部错误' })
  })

  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  baseUrl = `${origin}/api/public/share-cards`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  if (!fs.existsSync(TMP_DIR)) return
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f))
})

async function upload(body) {
  const res = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

describe('分享卡上传', () => {
  it('上传合法 JPEG 应返回可访问的 URL', async () => {
    const { status, data } = await upload({ image: jpegPayload() })
    expect(status).toBe(200)
    expect(data.url).toMatch(/^\/api\/public\/share-cards\/[0-9a-f-]{36}\.jpg$/)
    expect(data.expiresIn).toBe(300)
  })

  it('真实卡片体积（约 400KB）应能上传成功', async () => {
    const { status } = await upload({ image: jpegPayload(400 * 1024) })
    expect(status).toBe(200)
  })

  it('超过 1MB 应拒绝', async () => {
    const { status } = await upload({ image: jpegPayload(MAX_FILE_SIZE + 1024) })
    expect(status).toBe(400)
  })

  it('请求体超过 2mb 上限时应返回 413，而不是被全局错误处理器吞成 500', async () => {
    const { status } = await upload({ image: jpegPayload(1700 * 1024) })
    expect(status).toBe(413)
  })

  it('非 JPEG 魔数应拒绝', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const { status } = await upload({ image: `data:image/jpeg;base64,${png.toString('base64')}` })
    expect(status).toBe(400)
  })

  it('缺少 image 字段应拒绝', async () => {
    const { status } = await upload({})
    expect(status).toBe(400)
  })

  it('非 JPEG 的 data URL 前缀应拒绝', async () => {
    const { status } = await upload({ image: `data:image/png;base64,${jpegBuffer().toString('base64')}` })
    expect(status).toBe(400)
  })

  it(`目录已满 ${MAX_TOTAL_FILES} 张时应拒绝并返回 503`, async () => {
    for (let i = 0; i < MAX_TOTAL_FILES; i += 1) seedFile()
    const { status } = await upload({ image: jpegPayload() })
    expect(status).toBe(503)
  })

  it('过期文件不占用配额，上传前应先清理腾出空间', async () => {
    for (let i = 0; i < MAX_TOTAL_FILES; i += 1) seedFile(`${uuidv4()}.jpg`, 1024, EXPIRE_MS + 60 * 1000)
    const { status } = await upload({ image: jpegPayload() })
    expect(status).toBe(200)
  })
})

describe('分享卡访问', () => {
  it('有效文件应返回 image/jpeg', async () => {
    const { data } = await upload({ image: jpegPayload() })
    const res = await fetch(`${origin}${data.url}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('不存在的合法文件名应返回 204 而不是 404（避免被 SPA 回退成 index.html）', async () => {
    const res = await fetch(`${baseUrl}/${uuidv4()}.jpg`)
    expect(res.status).toBe(204)
  })

  it('非 UUID 文件名应返回 204', async () => {
    const res = await fetch(`${baseUrl}/not-a-uuid.jpg`)
    expect(res.status).toBe(204)
  })

  it('路径遍历应返回 204 且不泄露文件', async () => {
    const res = await fetch(`${baseUrl}/${encodeURIComponent('../../package.json')}`)
    expect(res.status).toBe(204)
  })

  it('过期文件应返回 204 并被删除', async () => {
    const fp = seedFile(`${uuidv4()}.jpg`, 1024, EXPIRE_MS + 60 * 1000)
    const res = await fetch(`${baseUrl}/${path.basename(fp)}`)
    expect(res.status).toBe(204)
    expect(fs.existsSync(fp)).toBe(false)
  })
})

describe('过期清理', () => {
  it('cleanExpiredCards 应删除过期文件并返回删除数量', async () => {
    const a = seedFile(`${uuidv4()}.jpg`, 1024, EXPIRE_MS + 60 * 1000)
    const b = seedFile(`${uuidv4()}.jpg`, 1024, EXPIRE_MS + 60 * 1000)
    const keep = seedFile(`${uuidv4()}.jpg`)

    const deleted = cleanExpiredCards()

    expect(deleted).toBe(2)
    expect(fs.existsSync(a)).toBe(false)
    expect(fs.existsSync(b)).toBe(false)
    expect(fs.existsSync(keep)).toBe(true)
  })

  it('没有过期文件时不应删除任何文件', async () => {
    const keep = seedFile(`${uuidv4()}.jpg`)
    expect(cleanExpiredCards()).toBe(0)
    expect(fs.existsSync(keep)).toBe(true)
  })
})
