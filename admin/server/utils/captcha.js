import crypto from 'crypto'

const SECRET = process.env.CAPTCHA_SECRET || process.env.TOKEN_SECRET || 'pet-garden-captcha-secret'

/**
 * 生成一个乘法验证码（无状态）：返回题目 a×b 与答案的 HMAC token。
 * 客户端提交答案 + token，服务端用相同密钥对答案做 HMAC 校验，
 * 无需存储 session，且小朋友不掌握密钥无法伪造 token。
 */
export function generateCaptcha() {
  const a = Math.floor(Math.random() * 8) + 2 // 2~9
  const b = Math.floor(Math.random() * 8) + 2 // 2~9
  const answer = a * b
  const token = crypto.createHmac('sha256', SECRET).update(String(answer)).digest('hex')
  return { token, a, b }
}

export function verifyCaptcha(token, answer) {
  if (!token || answer === undefined || answer === null || String(answer).trim() === '') return false
  const expected = crypto.createHmac('sha256', SECRET).update(String(Number(answer))).digest('hex')
  if (token.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
