// 家长端输入校验的统一定义
// 规则需与后端 admin/server/routes/parent.js 保持一致

export const NAME_MAX_LEN = 5
export const PASSWORD_MIN_LEN = 4
export const PASSWORD_MAX_LEN = 20

// 孩子姓名：纯中文，最多 5 个字
const CN_NAME_RE = /^[\u4e00-\u9fa5]{1,5}$/

export function isValidChildName(value: string) {
  return CN_NAME_RE.test(value.trim())
}

export function isValidPassword(value: string) {
  return value.length >= PASSWORD_MIN_LEN && value.length <= PASSWORD_MAX_LEN
}
