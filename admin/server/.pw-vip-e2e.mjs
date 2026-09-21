import Database from 'better-sqlite3'
const BASE = 'http://localhost:3002/api'
const results = []
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -> ' + d : ''}`) }
const j = async (m, p, body, token) => {
  const h = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined })
  let d = null; try { d = await r.json() } catch {}
  return { status: r.status, data: d }
}
const run = async () => {
  const r0 = await j('POST', '/auth/login', { username: '13934294873', password: 'test123' })
  const teacherToken = r0.data?.token
  check('教师登录', !!teacherToken, `status=${r0.status}`)
  if (!teacherToken) return finish()

  const rc = await j('POST', '/classes', { name: 'VIP规则班级' }, teacherToken)
  const vipClass = rc.data?.id
  check('创建VIP班级', !!vipClass)
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  const ldb = new Database('pet-garden.db')
  ldb.prepare(`INSERT OR REPLACE INTO class_vip_subscriptions (id, class_id, plan, status, started_at, expires_at, created_at, updated_at) VALUES (?, ?, 'manual', 'active', ?, ?, ?, ?)`).run('vip-' + vipClass, vipClass, Date.now(), expiresAt, Date.now(), Date.now())
  const vipRow = ldb.prepare('SELECT status FROM class_vip_subscriptions WHERE class_id = ?').get(vipClass)
  check('为班级写入VIP订阅(模拟已设VIP)', vipRow?.status === 'active')

  const rc2 = await j('POST', '/classes', { name: '非VIP班级' }, teacherToken)
  const noVipClass = rc2.data?.id
  check('创建非VIP班级', !!noVipClass)

  const ruleName = '主动帮助同学_' + Math.floor(Math.random() * 100000)
  const rr = await j('POST', '/rules', { name: ruleName, points: 5, category: '互助' }, teacherToken)
  check('教师创建自定义规则', rr.status === 200 && rr.data?.id)
  const customRuleId = rr.data?.id

  const rsV = await j('POST', '/students', { classId: vipClass, name: 'VIP生', studentNo: '020' }, teacherToken)
  const vipStudent = rsV.data?.id
  const rsN = await j('POST', '/students', { classId: noVipClass, name: '非VIP生', studentNo: '021' }, teacherToken)
  const noVipStudent = rsN.data?.id
  check('添加VIP班学生', !!vipStudent)
  check('添加非VIP班学生', !!noVipStudent)

  const rCls = await j('GET', `/public/rules?classId=${vipClass}`)
  check('班级规则含本班自定义规则', (rCls.data?.rules || []).some(x => x.name === ruleName))
  const rGlob = await j('GET', '/public/rules')
  check('全局规则不含本班自定义规则(隔离)', !(rGlob.data?.rules || []).some(x => x.name === ruleName))

  const setup = async (sid) => {
    const cap = (await j('GET', '/parent/captcha')).data
    const r = await j('POST', '/parent/setup', { studentId: sid, password: '1234', captchaToken: cap.token, captchaAnswer: cap.a * cap.b })
    return r.data?.token
  }
  const vipTok = await setup(vipStudent)
  const noVipTok = await setup(noVipStudent)
  check('VIP班学生设置密码并登录', !!vipTok)
  check('非VIP班学生设置密码并登录', !!noVipTok)

  const radV = await j('POST', '/parent/adopt', { petType: 'white-tiger' }, vipTok)
  check('D2a VIP班级领养神兽成功', radV.status === 200, `status=${radV.status} ${JSON.stringify(radV.data)?.slice(0, 100)}`)
  const rmp = await j('GET', '/parent/my-pet', undefined, vipTok)
  check('my-pet 神兽类型正确', rmp.data?.student?.pet_type === 'white-tiger', `pet_type=${rmp.data?.student?.pet_type}`)

  const radN = await j('POST', '/parent/adopt', { petType: 'white-tiger' }, noVipTok)
  check('D2b 非VIP班级领养神兽被拒(400+提示)', radN.status === 400 && String(radN.data?.error || '').includes('VIP'), `status=${radN.status} ${JSON.stringify(radN.data)?.slice(0, 100)}`)

  const rsc = await j('POST', '/parent/score', { ruleId: customRuleId }, vipTok)
  check('用本班自定义规则加分', rsc.status === 200, `status=${rsc.status}`)

  finish()
}
function finish() {
  const p = results.filter(r => r.ok).length, f = results.length - p
  console.log(`\n==== API E2E 汇总 ====\n总计 ${results.length}，通过 ${p}，失败 ${f}`)
  process.exit(f > 0 ? 1 : 0)
}
run().catch(e => { console.log('异常', e); process.exit(2) })
