import { db } from '../db.js'
import { deleteClassData } from '../utils/adminCleanup.js'

// 仅保留系统账户；admin 用于后台授权 VIP，guest 用于"游览"入口（启动时都会自动重建）
const KEEP_USERS = ['admin', 'guest']

async function count(table, where = '') {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${where}`).get()
  return row?.c ?? 0
}

async function main() {
  console.log('=== 生产库全量清理（保留系统规则 / 等级配置 / 系统账户）===')
  console.log('数据库文件:', process.env.SQLITE_PATH || 'server/pet-garden.db (默认)')

  // 1. 所有班级级联删除（学生 / 评价记录 / 任务 / 完成记录 / 徽章 / VIP）
  const classes = await count('classes')
  const classRows = await db.prepare('SELECT id FROM classes').all()
  for (const { id } of classRows) {
    await deleteClassData(db, id)
  }
  console.log(`已删除班级 ${classes} 个（含学生 / 评价记录 / 任务 / 徽章 / VIP）`)

  // 2. 自定义规则（is_custom = 1，属某老师自建，非系统预置）
  const customRules = await count('evaluation_rules', 'WHERE is_custom = 1')
  await db.prepare('DELETE FROM evaluation_rules WHERE is_custom = 1').run()
  console.log(`已删除自定义规则 ${customRules} 条`)

  // 3. 用户：删除除 admin / guest 之外的所有账号（即测试/真实老师账号）
  const usersBefore = await count('users')
  const placeholders = KEEP_USERS.map(() => '?').join(',')
  await db.prepare(`DELETE FROM users WHERE username NOT IN (${placeholders})`).run(...KEEP_USERS)
  const usersAfter = await count('users')
  console.log(`已删除用户 ${usersBefore - usersAfter} 个，保留系统账户 ${usersAfter} 个（${KEEP_USERS.join(', ')}）`)

  // 4. 清理后剩余
  console.log('--- 清理后剩余 ---')
  console.log(`  班级 ${await count('classes')} 个，学生 ${await count('students')} 人`)
  console.log(`  系统规则 ${await count('evaluation_rules')} 条，设置 ${await count('settings')} 条`)
  console.log('✅ 生产库清理完成（启动后会自动重建 admin/guest 账户与 25 条系统规则）')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('清理失败:', err)
    process.exit(1)
  })
