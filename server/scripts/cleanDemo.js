import { db } from '../db.js'
import { deleteClassData, DEMO_CLASS_ID } from '../utils/adminCleanup.js'

const REMOVE_GUEST = process.argv.includes('--remove-guest')

async function count(table, where = '') {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${where}`).get()
  return row?.c ?? 0
}

async function main() {
  console.log('=== 演示数据清理 ===')
  console.log('数据库文件:', process.env.SQLITE_PATH || 'server/pet-garden.db (默认)')

  // 1. 演示班级级联删除（学生 / 评价记录 / 任务 / 徽章 / VIP）
  const demoStudents = await count('students', `WHERE class_id = '${DEMO_CLASS_ID}'`)
  const demoRecords = await count('evaluation_records', `WHERE class_id = '${DEMO_CLASS_ID}'`)
  const demoTasks = await count('class_tasks', `WHERE class_id = '${DEMO_CLASS_ID}'`)
  const demoVip = await count('class_vip_subscriptions', `WHERE class_id = '${DEMO_CLASS_ID}'`)

  await deleteClassData(db, DEMO_CLASS_ID)

  // 2. 演示规则（id 以 demo-rule- 开头，属系统规则会被所有老师看到，视为垃圾）
  const demoRules = await count('evaluation_rules', "WHERE id LIKE 'demo-rule-%'")
  await db.prepare("DELETE FROM evaluation_rules WHERE id LIKE 'demo-rule-%'").run()

  console.log(`已删除演示班级 ${DEMO_CLASS_ID}:`)
  console.log(`  - 学生 ${demoStudents} 人`)
  console.log(`  - 评价记录 ${demoRecords} 条`)
  console.log(`  - 班级任务 ${demoTasks} 条`)
  console.log(`  - VIP 订阅 ${demoVip} 条`)
  console.log(`  - 演示规则 ${demoRules} 条`)

  // 3. （可选）删除游客用户。注意：会同时移除「游览/演示」入口，按需使用。
  if (REMOVE_GUEST) {
    const guest = await db.prepare("SELECT id FROM users WHERE username = 'guest'").get()
    if (guest) {
      await db.prepare('DELETE FROM users WHERE id = ?').run(guest.id)
      console.log('已删除游客用户 guest')
    }
  }

  // 4. 校验剩余真实数据
  const classes = await count('classes')
  const students = await count('students')
  const rules = await count('evaluation_rules')
  console.log('--- 清理后剩余 ---')
  console.log(`  班级 ${classes} 个，学生 ${students} 人，规则 ${rules} 条`)
  if (classes === 0) {
    console.log('提示：当前数据库已无班级。上线后由老师注册并创建真实班级即可。')
  }
  console.log('✅ 演示数据清理完成')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('清理失败:', err)
    process.exit(1)
  })
