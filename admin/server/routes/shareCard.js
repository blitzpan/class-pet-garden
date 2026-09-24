import express, { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import rateLimit from 'express-rate-limit'
import { isRateLimitDisabled } from '../middleware/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- 配置 ----
// 生产容器挂载持久卷到 /data，用 SHARE_CARD_DIR 指过去；本地/测试不设则落在 admin/uploads 下
const UPLOAD_DIR = process.env.SHARE_CARD_DIR
  ? path.resolve(process.env.SHARE_CARD_DIR)
  : path.resolve(__dirname, '../../uploads/share-cards')
const MAX_FILE_SIZE = 1024 * 1024       // 1MB
const MAX_TOTAL_FILES = 200             // 最多存 200 张
const CARD_EXPIRE_MS = 5 * 60 * 1000    // 5 分钟过期
// 1MB 图片 base64 后约 1.37MB，留出 JSON 包装余量；全局 express.json 默认只有 100kb
const UPLOAD_BODY_LIMIT = '2mb'

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  }
}
ensureDir()

// ---- 限流：单 IP 每分钟 20 次（同一 Wi-Fi / 家庭群里多人同时打开是主要场景） ----
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isRateLimitDisabled(),
  handler: (req, res) => {
    res.status(429).json({ error: '上传过于频繁，请稍后再试' })
  },
})

// ---- 文件名白名单：防止路径遍历 ----
const FILE_NAME_RE = /^[0-9a-f-]{36}\.jpg$/

// ---- 是否是过期文件 ----
function isExpired(filepath) {
  try {
    const stat = fs.statSync(filepath)
    return Date.now() - stat.mtimeMs > CARD_EXPIRE_MS
  } catch {
    return true
  }
}

// ---- 扫描目录：返回有效文件数，可选顺带删除过期文件 ----
function scanDir(alsoDelete = false) {
  if (!fs.existsSync(UPLOAD_DIR)) return { valid: 0, deleted: 0 }
  let valid = 0
  let deleted = 0
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    if (!FILE_NAME_RE.test(name)) continue
    const fp = path.join(UPLOAD_DIR, name)
    if (isExpired(fp)) {
      if (alsoDelete) {
        try {
          fs.unlinkSync(fp)
          deleted += 1
        } catch { /* 并发删除等，忽略 */ }
      }
    } else {
      valid += 1
    }
  }
  return { valid, deleted }
}

const router = Router()

// body 解析失败（超限/非法 JSON）会冒泡到全局错误处理器并被统一吞成 500，
// 这里显式兜住，给出可读的状态码
function parseUploadBody(req, res, next) {
  express.json({ limit: UPLOAD_BODY_LIMIT })(req, res, (err) => {
    if (!err) {
      next()
      return
    }
    const tooLarge = err.type === 'entity.too.large'
    res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? '图片过大' : '请求格式错误' })
  })
}

// POST /api/public/share-cards/upload
// 自带 body parser：全局 express.json() 默认 100kb，装不下几百 KB 的卡片
router.post('/upload', uploadLimiter, parseUploadBody, (req, res) => {
  try {
    const { image } = req.body || {}
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: '缺少图片数据' })
    }

    // 剥离 base64 前缀
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, '')
    if (base64Data === image) {
      return res.status(400).json({ error: '图片格式必须是 JPEG' })
    }

    // 大小预估（base64 约 1.33 倍膨胀）
    const estSize = Math.ceil((base64Data.length * 3) / 4)
    if (estSize > MAX_FILE_SIZE) {
      return res.status(400).json({ error: '图片过大' })
    }

    // 解码
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(400).json({ error: '图片过大' })
    }

    // JPEG 魔数校验
    if (buffer.length < 3 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
      return res.status(400).json({ error: '不是有效的 JPEG 图片' })
    }

    // 顺带清理过期文件腾空间，并统计当前有效数量
    if (scanDir(true).valid >= MAX_TOTAL_FILES) {
      return res.status(503).json({ error: '图片存储已满，请稍后再试' })
    }

    // 写入
    const filename = `${uuidv4()}.jpg`
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)

    res.json({
      url: `/api/public/share-cards/${filename}`,
      expiresIn: Math.floor(CARD_EXPIRE_MS / 1000),
    })
  } catch (err) {
    console.error('[share-card] 上传失败:', err)
    res.status(500).json({ error: '上传失败，请重试' })
  }
})

// GET /api/public/share-cards/:filename
router.get('/:filename', (req, res) => {
  const { filename } = req.params

  // 严防路径遍历
  if (!FILE_NAME_RE.test(filename)) {
    res.status(204).end()
    return
  }

  const filepath = path.join(UPLOAD_DIR, filename)

  // 确认路径安全（双重保险）
  if (!filepath.startsWith(UPLOAD_DIR)) {
    res.status(204).end()
    return
  }

  // 文件不存在或已过期 → 删除 + 204
  if (!fs.existsSync(filepath) || isExpired(filepath)) {
    try { fs.unlinkSync(filepath) } catch { /* 文件可能已被删 */ }
    res.status(204).end()
    return
  }

  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  fs.createReadStream(filepath).pipe(res)
})

// ---- 清理函数（供定时任务调用） ----
export function cleanExpiredCards() {
  try {
    ensureDir()
    const { deleted } = scanDir(true)
    if (deleted > 0) {
      console.log(`[share-card] 清理了 ${deleted} 张过期分享卡`)
    }
    return deleted
  } catch (err) {
    console.error('[share-card] 清理失败:', err)
    return 0
  }
}

export default router