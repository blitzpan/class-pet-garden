import { verifyToken } from '../utils/token.js'

/**
 * 家长端鉴权中间件：校验家长 JWT，并把 studentId 挂到 req 上。
 * 家长 token 复用管理端签名体系（userId 字段即学生 id），仅在 /api/parent 路由下使用，
 * 因此无法越权操作其他学生或管理端资源。
 */
export async function parentAuthMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || ''
    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ error: '请先登录' })
    }
    req.studentId = payload.userId
    next()
  } catch (error) {
    next(error)
  }
}
